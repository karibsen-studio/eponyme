import { describe, expect, it, vi } from 'vitest'
import { defineEponymeConfig } from '../src/config/config'
import { collection } from '../src/config/collection'
import { field } from '../src/runtime/fields'
import { today } from '../src/runtime/fields/date'
import { EponymeService, isEponymeLive, schemaFingerprint, type EponymeExportFile, type EponymeFilterCondition, type PrismaEponymeClient, type PrismaEponymeDelegates, type PrismaEponymeWhere, type PrismaStringFilter } from '../src/runtime/server/services/eponyme-store'
import { buildEponymeIndexRows, type EponymeIndexRow } from '../src/runtime/utils/eponyme-entry-index'
import { createDefaultEponymeData } from '../src/runtime/utils/create-default-eponyme-data'
import { validateEponymeData } from '../src/runtime/utils/validate-eponyme-data'
import { normalizeSlug } from '../src/runtime/utils/normalize-slug'

type StoredRow = {
  draft: Record<string, unknown>
  published: Record<string, unknown>
  status: string
  publishedAt: Date | null
  scheduledPublishAt?: Date | null
  scheduledUnpublishAt?: Date | null
}

function createClient(initial: Record<string, unknown> = {}) {
  const rows = new Map<string, StoredRow>()
  const versions: Array<{ id: number, entryName: string, data: unknown, action: string, status: string, createdAt: Date, userId?: string | null }> = []
  const auditEvents: Array<Record<string, unknown>> = []
  // Stand-in for the EponymeUser table, so history can resolve version authors.
  const users = new Map<string, { id: string, username: string }>([
    ['user-1', { id: 'user-1', username: 'Alice' }],
    ['user-2', { id: 'user-2', username: 'Bob' }],
  ])
  // Mirrors Prisma's `@updatedAt`: a monotonic stamp per row, which the store uses as an optimistic lock.
  const stamps = new Map<string, Date>()
  // The soft-delete column, kept beside the rows rather than inside their JSON payload.
  const deletions = new Map<string, Date>()
  let clock = 0
  const touch = (name: string) => {
    const stamp = new Date(++clock)
    stamps.set(name, stamp)
    return stamp
  }
  const read = (name: string) => ({
    name,
    ...rows.get(name)!,
    updatedAt: stamps.get(name),
    deletedAt: deletions.get(name) ?? null,
  })
  const write = (name: string, data: Partial<StoredRow>) => {
    const current = rows.get(name)
    rows.set(name, {
      draft: {},
      published: {},
      status: 'published',
      publishedAt: null,
      scheduledPublishAt: null,
      scheduledUnpublishAt: null,
      ...current,
      ...data,
    })
    touch(name)
    return read(name)
  }
  const matchesDeleted = (name: string, filter: null | { not: null } | undefined) => {
    if (filter === undefined) return true
    return filter === null ? !deletions.has(name) : deletions.has(name)
  }
  // This double is the specification of ordering for every pushdown test, so `nulls: 'last'`
  // is honoured explicitly rather than left to JavaScript's comparison rules.
  const matchesWhere = (name: string, where: PrismaEponymeWhere): boolean => {
    const byName = where.name === undefined
      || (typeof where.name === 'string'
        ? name === where.name
        : 'in' in where.name ? where.name.in.includes(name) : name.startsWith(where.name.startsWith))
    if (!byName || !matchesDeleted(name, where.deletedAt)) return false
    const row = rows.get(name)!
    if (where.publishedAt !== undefined && row.publishedAt === null) return false
    if (where.status !== undefined && row.status !== where.status) return false
    const matchesDate = (value: Date | null | undefined, filter: null | { lte?: Date, gt?: Date } | undefined) => {
      if (filter === undefined) return true
      if (filter === null) return value == null
      if (value == null) return false
      return (filter.lte === undefined || value <= filter.lte) && (filter.gt === undefined || value > filter.gt)
    }
    if (!matchesDate(row.scheduledPublishAt, where.scheduledPublishAt)) return false
    if (!matchesDate(row.scheduledUnpublishAt, where.scheduledUnpublishAt)) return false
    if (where.AND && !where.AND.every(clause => matchesWhere(name, clause))) return false
    if (where.OR && !where.OR.some(clause => matchesWhere(name, clause))) return false
    return true
  }
  const compare = (left: string, right: string, orderBy: Array<Record<string, unknown>>): number => {
    for (const clause of orderBy) {
      const [key, raw] = Object.entries(clause)[0]!
      const spec = typeof raw === 'string' ? { sort: raw, nulls: undefined } : raw as { sort: string, nulls?: string }
      const value = (name: string): string | null => key === 'name'
        ? name
        : key === 'updatedAt'
          ? (stamps.get(name)?.toISOString() ?? null)
          : (rows.get(name)!.publishedAt?.toISOString() ?? null)
      const a = value(left)
      const b = value(right)
      if (a === b) continue
      // Postgres puts NULLs first in DESC unless told otherwise; `nulls: 'last'` is what the
      // store sends so the two listing modes agree on where an empty value belongs.
      if (a === null || b === null) {
        if (spec.nulls === 'last') return a === null ? 1 : -1
        return spec.sort === 'desc' ? (a === null ? -1 : 1) : (a === null ? -1 : 1)
      }
      return (a < b ? -1 : 1) * (spec.sort === 'asc' ? 1 : -1)
    }
    return 0
  }
  // The filterable values pulled out of each entry, keyed by the table's primary key.
  const indexRows = new Map<string, EponymeIndexRow>()
  const indexKey = (row: EponymeIndexRow) => [row.entryName, row.version, row.key, row.value].join('\u0000')
  const matchesValue = (value: string, filter: PrismaStringFilter) => {
    if (typeof filter === 'string') return value === filter
    // Every operator present is ANDed, as Prisma's string filter does.
    if (filter.in && !filter.in.includes(value)) return false
    if (filter.contains !== undefined && !value.includes(filter.contains)) return false
    if (filter.gte !== undefined && value < filter.gte) return false
    if (filter.gt !== undefined && value <= filter.gt) return false
    if (filter.lte !== undefined && value > filter.lte) return false
    if (filter.lt !== undefined && value >= filter.lt) return false
    return true
  }
  const dropIndex = (name: string) => {
    for (const [key, row] of indexRows) if (row.entryName === name) indexRows.delete(key)
  }
  // The recorded fingerprint per configured name, which decides what a boot rebuilds.
  const indexState = new Map<string, string>()
  if (Object.keys(initial).length) write('homepage', { draft: initial, published: initial })
  const client: PrismaEponymeDelegates = {
    eponyme: {
      async upsert({ where, create, update }) {
        if (rows.has(where.name)) return write(where.name, update)
        const { name, ...columns } = create
        return write(name, columns)
      },
      async update({ where, data }) {
        return write(where.name, data)
      },
      async updateMany({ where, data }) {
        const stamp = stamps.get(where.name)
        if (!rows.has(where.name)) return { count: 0 }
        if (where.updatedAt && new Date(where.updatedAt).getTime() !== stamp?.getTime()) return { count: 0 }
        if (!matchesDeleted(where.name, where.deletedAt)) return { count: 0 }
        if (data.deletedAt === null) deletions.delete(where.name)
        else if (data.deletedAt) deletions.set(where.name, data.deletedAt)
        const { deletedAt: _ignored, ...columns } = data
        write(where.name, columns)
        return { count: 1 }
      },
      async findMany({ where, orderBy, take, skip, select }) {
        const matched = [...rows.keys()].filter(name => matchesWhere(name, where))
        if (orderBy) matched.sort((left, right) => compare(left, right, orderBy as Array<Record<string, unknown>>))
        const from = skip ?? 0
        const page = take === undefined ? matched.slice(from) : matched.slice(from, from + take)
        // Mirrors Prisma: `select` narrows the row to exactly what was asked for, which is
        // what proves a public listing never reads the draft column.
        if (!select) return page.map(name => read(name))
        return page.map((name) => {
          const row = read(name) as Record<string, unknown>
          return Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) as unknown as ReturnType<typeof read>
        })
      },
      async count({ where }) {
        return [...rows.keys()].filter(name => matchesWhere(name, where)).length
      },
      async create({ data }) {
        if (rows.has(data.name)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
        const { name, ...columns } = data
        return write(name, columns)
      },
      async findUnique({ where }) {
        return rows.has(where.name) ? read(where.name) : null
      },
      async delete({ where }) {
        const row = rows.get(where.name)
        if (!row) throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' })
        rows.delete(where.name)
        stamps.delete(where.name)
        deletions.delete(where.name)
        // Mirrors `onDelete: Cascade` on EponymeVersion.entryName and EponymeEntryIndex.entryName.
        for (let index = versions.length - 1; index >= 0; index--)
          if (versions[index]!.entryName === where.name) versions.splice(index, 1)
        dropIndex(where.name)
        return { name: where.name, ...row }
      },
    },
    eponymeEntryIndex: {
      async deleteMany({ where }) {
        let count = 0
        for (const [key, row] of indexRows) {
          const hit = typeof where.entryName === 'string'
            ? row.entryName === where.entryName
            : row.entryName.startsWith(where.entryName.startsWith)
          if (!hit) continue
          indexRows.delete(key)
          count++
        }
        return { count }
      },
      async createMany({ data }) {
        // The table's primary key covers every column, so a duplicate is a bug upstream.
        for (const row of data) {
          if (indexRows.has(indexKey(row))) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
          indexRows.set(indexKey(row), row)
        }
        return { count: data.length }
      },
      async findMany({ where }) {
        // `entryName` and `version` are absent when the question spans every collection,
        // which is what the referrer lookup asks.
        return [...indexRows.values()]
          .filter(row => (!where.entryName || row.entryName.startsWith(where.entryName.startsWith))
            && (!where.version || row.version === where.version)
            && row.key === where.key
            && matchesValue(row.value, where.value))
          .map(row => ({ entryName: row.entryName }))
      },
    },
    eponymeIndexState: {
      async findMany() {
        return [...indexState.entries()].map(([name, fingerprint]) => ({ name, fingerprint }))
      },
      async upsert({ where, create, update }) {
        const fingerprint = indexState.has(where.name) ? update.fingerprint : create.fingerprint
        indexState.set(where.name, fingerprint)
        return { name: where.name, fingerprint }
      },
      async deleteMany({ where }) {
        let count = 0
        for (const name of where.name.in) if (indexState.delete(name)) count++
        return { count }
      },
    },
    eponymeVersion: {
      async create({ data }) {
        const version = { id: versions.length + 1, ...data, createdAt: new Date() }
        versions.push(version)
        return version
      },
      async findMany({ where, take, include }) {
        const rows = versions.filter(version => version.entryName === where.entryName).slice(-take).reverse()
        // Mirrors Prisma: the author is only joined when explicitly included.
        return include?.user
          ? rows.map(version => ({ ...version, user: version.userId ? users.get(version.userId) ?? null : null }))
          : rows
      },
      async findUnique({ where }) {
        return versions.find(version => version.id === where.id) ?? null
      },
    },
    eponymeAuditEvent: {
      async create({ data }) {
        auditEvents.push(data)
        return data
      },
    },
  }
  // Counts the queries a call actually sends, so a regression back to N+1 or to
  // writing during a read fails the suite instead of only being slower.
  const counts: Record<string, number> = {}
  const countingClient = Object.fromEntries(Object.entries(client).map(([model, methods]) => [
    model,
    Object.fromEntries(Object.entries(methods).map(([method, fn]) => [
      method,
      (...args: unknown[]) => {
        const key = `${model}.${method}`
        counts[key] = (counts[key] ?? 0) + 1
        counts.total = (counts.total ?? 0) + 1
        return (fn as (...a: unknown[]) => unknown)(...args)
      },
    ])),
  ])) as unknown as PrismaEponymeClient

  // Stand-in for an interactive transaction. It hands back the same delegates and, on a
  // rejected callback, restores every table to the state it found – so the suite can
  // assert the rollback rather than assume Postgres provides it.
  const restoreMap = <K, V>(target: Map<K, V>, source: Map<K, V>) => {
    target.clear()
    for (const [key, value] of source) target.set(key, value)
  }
  // They also run one at a time, as a single connection would: overlapping them on shared
  // maps would let one rollback undo a neighbour's committed write, which no database does.
  let transactions = 0
  let queue: Promise<unknown> = Promise.resolve()
  countingClient.$transaction = (fn) => {
    transactions++
    const run = queue.then(async () => {
      const snapshot = {
        rows: new Map(rows),
        stamps: new Map(stamps),
        deletions: new Map(deletions),
        index: new Map(indexRows),
        state: new Map(indexState),
        versions: [...versions],
        auditEvents: [...auditEvents],
        clock,
      }
      try {
        return await fn(countingClient)
      }
      catch (error) {
        restoreMap(rows, snapshot.rows)
        restoreMap(stamps, snapshot.stamps)
        restoreMap(deletions, snapshot.deletions)
        restoreMap(indexRows, snapshot.index)
        restoreMap(indexState, snapshot.state)
        versions.splice(0, versions.length, ...snapshot.versions)
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents)
        clock = snapshot.clock
        throw error
      }
    })
    queue = run.catch(() => {})
    return run
  }

  return {
    client: countingClient,
    transactionCount: () => transactions,
    rows,
    versions,
    auditEvents,
    deletions,
    indexRows,
    indexState,
    counts,
    resetCounts: () => {
      for (const key of Object.keys(counts)) counts[key] = 0
    },
    /** Queries that mutate a row. A public read must send none of these. */
    writeCount: () => (counts['eponyme.upsert'] ?? 0) + (counts['eponyme.update'] ?? 0)
      + (counts['eponyme.updateMany'] ?? 0) + (counts['eponyme.create'] ?? 0) + (counts['eponyme.delete'] ?? 0),
  }
}

const config = defineEponymeConfig({
  homepage: {
    title: field.string({ required: true, defaultValue: 'Welcome' }),
    enabled: field.boolean({ defaultValue: true }),
    tags: field.array({
      of: field.string({ required: true, minLength: 2 }),
      defaultValue: ['nuxt'],
      minItems: 1,
      maxItems: 3,
    }),
  },
  articles: collection({
    label: 'Articles',
    titleField: 'title',
    slugField: 'slug',
    fields: {
      title: field.string({ required: true }),
      slug: field.slug({ required: true }),
      summary: field.textarea(),
    },
  }),
})

describe('isEponymeLive', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')
  const state = (scheduledPublishAt: string | null, scheduledUnpublishAt: string | null, status = 'published' as const) => ({
    status,
    scheduledPublishAt,
    scheduledUnpublishAt,
  })

  it('accepts an undated publication and rejects every non-published status', () => {
    expect(isEponymeLive(state(null, null), now)).toBe(true)
    expect(isEponymeLive({ ...state(null, null), status: 'draft' }, now)).toBe(false)
    expect(isEponymeLive({ ...state(null, null), status: 'unpublished' }, now)).toBe(false)
  })

  it('applies both dates and their exact boundaries', () => {
    expect(isEponymeLive(state('2026-08-08T12:00:00.000Z', null), now)).toBe(true)
    expect(isEponymeLive(state('2026-08-08T12:00:00.001Z', null), now)).toBe(false)
    expect(isEponymeLive(state(null, '2026-08-08T12:00:00.001Z'), now)).toBe(true)
    expect(isEponymeLive(state(null, '2026-08-08T12:00:00.000Z'), now)).toBe(false)
    expect(isEponymeLive(state('2026-08-08T11:00:00.000Z', '2026-08-08T13:00:00.000Z'), now)).toBe(true)
  })
})

describe('EponymeService', () => {
  it('synchronizes config changes, patches and resets one row', async () => {
    const { client, rows } = createClient({ title: 'Stored', tags: 'old format', removed: 'discard me' })
    const service = new EponymeService(config, client)

    await service.syncAll()
    // Content lives in columns: a field the schema no longer declares is dropped, one it
    // declares but the row lacks takes its default, and a value of the wrong shape is coerced.
    expect(rows.get('homepage')).toEqual({
      draft: { title: 'Stored', enabled: true, tags: ['nuxt'] },
      published: { title: 'Stored', enabled: true, tags: ['nuxt'] },
      status: 'published',
      publishedAt: null,
      scheduledPublishAt: null,
      scheduledUnpublishAt: null,
    })
    await expect(service.patch('homepage', { title: 'Changed' })).resolves.toMatchObject({
      data: { title: 'Changed', enabled: true, tags: ['nuxt'] },
      status: 'published',
    })
  })

  it('sanitizes legacy RichText on read and migrates every collection row at startup', async () => {
    const unsafe = '<img src="javascript:alert(1)" onerror="alert(1)"><p onclick="alert(1)">Safe</p>'
    const safe = '<img /><p>Safe</p>'
    const richConfig = defineEponymeConfig({
      page: { body: field.richText() },
      posts: collection({
        label: 'Posts',
        titleField: 'title',
        slugField: 'slug',
        fields: {
          title: field.string(),
          slug: field.slug(),
          body: field.richText(),
        },
      }),
    })
    const { client, rows, deletions } = createClient()
    rows.set('page', { draft: { body: unsafe }, published: { body: unsafe }, status: 'published', publishedAt: null })
    rows.set('posts/legacy', {
      draft: { title: 'Legacy', slug: 'legacy', body: unsafe },
      published: { title: 'Legacy', slug: 'legacy', body: unsafe },
      status: 'published',
      publishedAt: new Date(),
    })
    deletions.set('posts/legacy', new Date())
    const service = new EponymeService(richConfig, client)

    await expect(service.get('page')).resolves.toEqual({ body: safe })
    expect(rows.get('page')?.published).toEqual({ body: safe })

    await service.syncAll()
    expect(rows.get('posts/legacy')?.draft).toMatchObject({ body: safe })
    expect(rows.get('posts/legacy')?.published).toMatchObject({ body: safe })
  })

  it('fills in a field added inside a section, a tab or an array item', async () => {
    // What the row looked like before the new fields were declared: the containers exist and
    // are still valid, which is exactly why a top-level pass used to leave them alone.
    const content = {
      hero: { title: 'Kept' },
      meta: { seo: { title: 'Kept too' } },
      people: [{ name: 'Ada' }],
    }
    const { client, rows } = createClient()
    rows.set('nested', { draft: content, published: content, status: 'published', publishedAt: null })

    const nestedConfig = defineEponymeConfig({
      nested: {
        hero: field.section({
          fields: {
            title: field.string(),
            subtitle: field.string({ defaultValue: 'Filled in' }),
          },
        }),
        meta: field.tab({
          tabs: {
            seo: {
              label: 'SEO',
              fields: {
                title: field.string(),
                description: field.string({ defaultValue: 'From the tab' }),
              },
            },
          },
        }),
        people: field.array({
          of: {
            name: field.string(),
            role: field.string({ defaultValue: 'Member' }),
          },
        }),
      },
    })

    const service = new EponymeService(nestedConfig, client)
    await service.syncAll()

    expect(await service.get('nested', 'draft')).toEqual({
      hero: { title: 'Kept', subtitle: 'Filled in' },
      meta: { seo: { title: 'Kept too', description: 'From the tab' } },
      people: [{ name: 'Ada', role: 'Member' }],
    })
  })

  it('reports a conflict instead of overwriting a concurrent edit', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)
    await service.syncAll()

    // Both editors read the same state, then write one after the other.
    const [first, second] = await Promise.all([
      service.patch('homepage', { title: 'From tab A' }, 'draft'),
      service.patch('homepage', { title: 'From tab B' }, 'draft'),
    ])

    const outcomes = [first, second]
    expect(outcomes.filter(result => result && 'conflict' in result && result.conflict)).toHaveLength(1)
    expect(outcomes.filter(result => result && 'data' in result)).toHaveLength(1)
    // The winner's content is what remains stored – never a silent mix of both.
    const stored = await service.get('homepage', 'draft')
    expect(['From tab A', 'From tab B']).toContain(stored!.title)
  })

  it('does not let the schema reconciliation overwrite a save that lands during it', async () => {
    // A row whose stored shape has drifted from the schema, so reading it heals it.
    const { client, rows } = createClient({ title: 'Stored', tags: 'old format', removed: 'discard me' })
    const service = new EponymeService(config, client)
    const canonical = { title: 'Saved by someone else', enabled: true, tags: ['nuxt'] }

    // The other editor commits between the read that decided to heal and the heal's write.
    const updateMany = client.eponyme.updateMany.bind(client.eponyme)
    vi.spyOn(client.eponyme, 'updateMany').mockImplementationOnce(async (args) => {
      await client.eponyme.update({
        where: { name: 'homepage' },
        data: {
          draft: canonical,
          published: canonical,
          status: 'published',
          publishedAt: null,
          scheduledPublishAt: null,
          scheduledUnpublishAt: null,
        },
      })
      return await updateMany(args)
    })

    await service.syncAll()

    // The save is what remains stored: the reconciliation saw the row move under it and gave
    // up rather than writing back the normalisation of the row it had read.
    expect(rows.get('homepage')).toMatchObject({ draft: canonical, published: canonical })
    await expect(service.get('homepage', 'draft')).resolves.toEqual(canonical)
  })

  it('accepts a save whose revision was only superseded by the schema reconciliation', async () => {
    const drifted = () => {
      const { client } = createClient({ title: 'Stored', tags: 'old format', removed: 'discard me' })
      return { client, service: new EponymeService(config, client) }
    }
    const revisionOf = async (client: PrismaEponymeDelegates) =>
      new Date((await client.eponyme.findUnique({ where: { name: 'homepage' } }))!.updatedAt!).toISOString()

    // What an editor holds after reading the entry, before anything reconciled it. A restart
    // is what puts the two on either side of a heal.
    const forgiven = drifted()
    const opened = await revisionOf(forgiven.client)
    await forgiven.service.syncAll()
    // The heal moved the row's stamp without changing a thing the editor was shown.
    expect(await revisionOf(forgiven.client)).not.toEqual(opened)

    await expect(forgiven.service.patch('homepage', { title: 'From the open tab' }, 'draft', undefined, {}, opened))
      .resolves.toMatchObject({ data: { title: 'From the open tab' } })

    // A real write in the middle of the chain is not forgiven: that content would be lost.
    const refused = drifted()
    const openedToo = await revisionOf(refused.client)
    await refused.service.syncAll()
    await refused.service.patch('homepage', { title: 'By someone else' }, 'draft')

    await expect(refused.service.patch('homepage', { title: 'From the open tab' }, 'draft', undefined, {}, openedToo))
      .resolves.toEqual({ conflict: true })
    await expect(refused.service.get('homepage', 'draft')).resolves.toMatchObject({ title: 'By someone else' })
  })

  it('refuses a save made against a revision someone else has already replaced', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)
    await service.syncAll()

    // What an editor holds after opening the entry.
    const opened = await service.getResult('homepage', 'draft')
    expect(opened!.revision).toEqual(expect.any(String))
    // A published read is served from the row cache, whose stamp can lag: no token to hand out.
    await expect(service.getResult('homepage', 'published')).resolves.toMatchObject({ revision: null })

    // Someone else saves while the first editor is still typing.
    const saved = await service.patch('homepage', { title: 'From tab B' }, 'draft')
    const savedRevision = saved && 'revision' in saved ? saved.revision : null
    expect(savedRevision).toEqual(expect.any(String))
    expect(savedRevision).not.toBe(opened!.revision)

    await expect(service.patch('homepage', { title: 'From tab A' }, 'draft', undefined, {}, opened!.revision!))
      .resolves.toEqual({ conflict: true })
    await expect(service.get('homepage', 'draft')).resolves.toMatchObject({ title: 'From tab B' })

    // The revision a save hands back is the one its own next save locks on, so an editor who
    // stays on the page is never in conflict with themselves.
    await expect(service.patch('homepage', { title: 'From tab B again' }, 'draft', undefined, {}, savedRevision!))
      .resolves.toMatchObject({ data: { title: 'From tab B again' } })

    // A caller that never read a revision keeps writing without the guard.
    await expect(service.patch('homepage', { title: 'From a script' }, 'draft'))
      .resolves.toMatchObject({ data: { title: 'From a script' } })
  })

  it('refuses a restore, a trashing and an untrashing made against a stale revision', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)
    await service.createCollectionEntry('articles', { title: 'Concurrent' })

    const opened = await service.getResult('articles/concurrent', 'draft')
    const [firstVersion] = (await service.history('articles/concurrent'))!
    await service.patch('articles/concurrent', { title: 'Renamed by someone else' }, 'draft')

    // Restoring replaces the whole entry, so it is refused against a version that moved on.
    await expect(service.restore('articles/concurrent', firstVersion!.id, undefined, opened!.revision!))
      .resolves.toEqual({ conflict: true })
    await expect(service.deleteCollectionEntry('articles/concurrent', undefined, opened!.revision!))
      .resolves.toEqual({ conflict: true })
    await expect(service.get('articles/concurrent', 'draft')).resolves.toMatchObject({ title: 'Renamed by someone else' })

    const fresh = await service.getResult('articles/concurrent', 'draft')
    await expect(service.deleteCollectionEntry('articles/concurrent', undefined, fresh!.revision!))
      .resolves.toEqual({ deleted: true })

    // A trashed entry reads as missing, so untrashing locks on what the trash listing showed.
    const trash = await service.listCollectionTrash('articles')
    await expect(service.restoreCollectionEntry('articles/concurrent', undefined, opened!.revision!))
      .resolves.toEqual({ conflict: true })
    await expect(service.restoreCollectionEntry('articles/concurrent', undefined, trash!.entries[0]!.updatedAt!))
      .resolves.toBe(true)
  })

  it('does not rewrite equivalent JSONB when object keys are returned in a different order', async () => {
    const { client, rows } = createClient()
    // Postgres does not preserve key order in JSONB, so a read can hand the payload back in
    // any order. Deep equality has to see through that, or every read would heal.
    rows.set('homepage', {
      draft: { tags: ['nuxt'], enabled: true, title: 'Welcome' },
      published: { tags: ['nuxt'], enabled: true, title: 'Welcome' },
      status: 'published',
      publishedAt: null,
    })
    const update = vi.spyOn(client.eponyme, 'update')
    const service = new EponymeService(config, client)

    await expect(service.get('homepage', 'draft')).resolves.toEqual({
      title: 'Welcome',
      enabled: true,
      tags: ['nuxt'],
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a duplicate slug created concurrently without leaving an orphan version', async () => {
    const { client, versions } = createClient()
    const service = new EponymeService(config, client)

    const [first, second] = await Promise.all([
      service.createCollectionEntry('articles', { title: 'Été à Paris', summary: 'a' }),
      service.createCollectionEntry('articles', { title: 'Été à Paris', summary: 'b' }),
    ])

    const created = [first, second].filter(result => result && !result.errors)
    expect(created).toHaveLength(1)
    expect([first, second].find(result => result?.errors)?.errors).toEqual({ slug: ['This slug is already in use.'] })
    expect(versions.filter(version => version.entryName === 'articles/ete-a-paris')).toHaveLength(1)
  })

  it('keeps the previous publication live while a new draft is prepared', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)

    await expect(service.patch('homepage', { title: '' }, 'draft')).resolves.toMatchObject({
      data: { title: '', enabled: true, tags: ['nuxt'] },
      status: 'published',
    })
    await expect(service.get('homepage')).resolves.toEqual({ title: 'Welcome', enabled: true, tags: ['nuxt'] })
    await expect(service.get('homepage', 'draft')).resolves.toEqual({ title: '', enabled: true, tags: ['nuxt'] })
    await expect(service.patch('homepage', {}, 'publish')).resolves.toEqual({ errors: { title: ['This field is required.'] } })
    await expect(service.patch('homepage', { title: 'Published' }, 'publish')).resolves.toMatchObject({
      data: { title: 'Published', enabled: true, tags: ['nuxt'] },
      status: 'published',
    })
    await expect(service.get('homepage')).resolves.toEqual({ title: 'Published', enabled: true, tags: ['nuxt'] })
  })

  it('unpublishes without discarding the published version, then republishes it', async () => {
    const { client, rows } = createClient()
    const service = new EponymeService(config, client, { cacheSeconds: 0 })
    await service.createCollectionEntry('articles', { title: 'Kept online', slug: 'kept-online' })
    await service.patch('articles/kept-online', {}, 'publish')
    const before = rows.get('articles/kept-online')!

    await expect(service.patch('articles/kept-online', {}, 'unpublish')).resolves.toMatchObject({ status: 'unpublished' })
    const hidden = rows.get('articles/kept-online')!
    expect(hidden.published).toEqual(before.published)
    expect(hidden.publishedAt).toEqual(before.publishedAt)
    await expect(service.getResult('articles/kept-online', 'published')).resolves.toBeUndefined()
    await expect(service.getResult('articles/kept-online', 'draft')).resolves.toMatchObject({ status: 'unpublished' })

    await service.patch('articles/kept-online', {}, 'publish')
    expect(rows.get('articles/kept-online')!.published).toEqual(before.published)
    await expect(service.get('articles/kept-online')).resolves.toMatchObject({ title: 'Kept online' })
  })

  it('reverts to draft by clearing the public version, then publishes the current draft', async () => {
    const { client, rows } = createClient()
    const service = new EponymeService(config, client, { cacheSeconds: 0 })
    await service.createCollectionEntry('articles', { title: 'Old public', slug: 'reverted' })
    await service.patch('articles/reverted', {}, 'publish')
    await service.patch('articles/reverted', { title: 'Prepared draft' }, 'draft')
    await expect(service.get('articles/reverted')).resolves.toMatchObject({ title: 'Old public' })

    await expect(service.patch('articles/reverted', {}, 'revertToDraft')).resolves.toMatchObject({ status: 'draft' })
    expect(rows.get('articles/reverted')).toMatchObject({ published: {}, publishedAt: null, status: 'draft' })
    await expect(service.getResult('articles/reverted', 'published')).resolves.toBeUndefined()

    await service.patch('articles/reverted', {}, 'publish')
    await expect(service.get('articles/reverted')).resolves.toMatchObject({ title: 'Prepared draft' })
  })

  it('changes public listings and the sitemap when scheduled time passes, without a write', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'))
      const { client, versions } = createClient()
      const service = new EponymeService(config, client, { cacheSeconds: 0 })
      await service.createCollectionEntry('articles', { title: 'Later', slug: 'later' })
      await service.patch('articles/later', {}, 'schedule', undefined, { scheduledPublishAt: '2026-08-08T12:02:00.000Z' })
      const writesBefore = versions.length

      await expect(service.listCollection('articles', 'published')).resolves.toMatchObject({ entries: [] })
      await expect(service.getSitemapEntries({ articles: '/articles/:slug' })).resolves.toEqual([])

      vi.setSystemTime(new Date('2026-08-08T12:02:00.000Z'))
      await expect(service.listCollection('articles', 'published')).resolves.toMatchObject({ entries: [{ slug: 'later' }] })
      await expect(service.getSitemapEntries({ articles: '/articles/:slug' })).resolves.toEqual([
        expect.objectContaining({ loc: '/articles/later' }),
      ])
      expect(versions).toHaveLength(writesBefore)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('materializes due schedules once and keeps unpublished status on reread', async () => {
    const { client, rows } = createClient()
    const service = new EponymeService(config, client, { cacheSeconds: 0 })
    await service.createCollectionEntry('articles', { title: 'Scheduled', slug: 'scheduled' })
    await service.patch('articles/scheduled', {}, 'schedule', undefined, { scheduledPublishAt: '2026-08-08T12:00:00.000Z' })

    await expect(service.runSchedule(new Date('2026-08-08T12:00:00.000Z'))).resolves.toMatchObject([{ action: 'publish' }])
    await expect(service.runSchedule(new Date('2026-08-08T12:00:00.000Z'))).resolves.toEqual([])
    await expect(service.history('articles/scheduled')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'publish' }),
    ]))

    rows.set('articles/scheduled', { ...rows.get('articles/scheduled')!, status: 'unpublished' })
    await expect(service.getResult('articles/scheduled', 'draft')).resolves.toMatchObject({ status: 'unpublished' })
    await expect(service.getResult('articles/scheduled', 'published')).resolves.toBeUndefined()
  })

  it('still reads a history version stored in either legacy envelope', async () => {
    // Live content moved to columns, but `EponymeVersion.data` deliberately keeps the
    // envelope so versions written before that change stay restorable. Both spellings of it
    // have to survive: `__keditor` predates the rename and was never migrated.
    const { client, versions } = createClient()
    const service = new EponymeService(config, client)
    await service.syncAll()

    for (const [id, key] of [[1, '__keditor'], [2, '__eponyme']] as const) {
      versions.push({
        id,
        entryName: 'homepage',
        data: {
          [key]: {
            version: 1,
            draft: { title: `From ${key}`, enabled: false, tags: ['draft'] },
            published: { title: `From ${key}`, enabled: true, tags: ['live'] },
            status: 'draft',
            publishedAt: null,
          },
        },
        action: 'draft',
        status: 'draft',
        createdAt: new Date(),
      })
    }

    await expect(service.getResult('homepage', 1)).resolves.toMatchObject({ data: { title: 'From __keditor' } })
    await expect(service.getResult('homepage', 2)).resolves.toMatchObject({ data: { title: 'From __eponyme' } })
    await expect(service.restore('homepage', 1)).resolves.toMatchObject({ data: { title: 'From __keditor' } })
    await expect(service.get('homepage', 'draft')).resolves.toMatchObject({ title: 'From __keditor' })
  })

  it('stores and restores version history', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)

    await service.patch('homepage', { title: 'First version' }, 'draft')
    await service.patch('homepage', { title: 'Published version' }, 'publish')
    const history = await service.history('homepage')

    expect(history).toHaveLength(2)
    await expect(service.restore('homepage', history![1]!.id)).resolves.toMatchObject({
      data: { title: 'First version' },
      status: 'published',
    })
    await expect(service.history('homepage')).resolves.toHaveLength(3)
  })

  it('attributes each version to the user who wrote it', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)

    await service.patch('homepage', { title: 'By Alice' }, 'draft', 'user-1')
    await service.patch('homepage', { title: 'By Bob' }, 'publish', 'user-2')
    // An automated write with no acting user stays authorless rather than being misattributed.
    await service.patch('homepage', { title: 'By nobody' }, 'draft')

    const history = await service.history('homepage')
    expect(history?.map(version => version.user?.username ?? null)).toEqual([null, 'Bob', 'Alice'])

    await service.restore('homepage', history!.at(-1)!.id, 'user-2')
    const afterRestore = await service.history('homepage')
    expect(afterRestore![0]).toMatchObject({ action: 'restore', user: { username: 'Bob' } })
  })

  it('sorts, limits and counts collection entries', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)

    for (const [title, summary] of [['Charlie', 'c'], ['alpha', 'a'], ['Bravo', 'b'], ['Delta', 'd']] as const) {
      await service.createCollectionEntry('articles', { title, slug: title.toLowerCase(), summary })
      await service.patch(`articles/${title.toLowerCase()}`, {}, 'publish')
    }
    // Left as a draft, so it must be absent from the public list and from `total`.
    await service.createCollectionEntry('articles', { title: 'Echo', slug: 'echo', summary: 'e' })

    const byTitle = await service.listCollection('articles', 'published', { orderBy: 'title', order: 'asc' })
    // Case-insensitive ordering, so `alpha` is not pushed behind the capitalised titles.
    expect(byTitle?.entries.map(entry => entry.title)).toEqual(['alpha', 'Bravo', 'Charlie', 'Delta'])
    expect(byTitle?.total).toBe(4)

    const descending = await service.listCollection('articles', 'published', { orderBy: 'title', order: 'desc' })
    expect(descending?.entries.map(entry => entry.title)).toEqual(['Delta', 'Charlie', 'Bravo', 'alpha'])

    const bySummary = await service.listCollection('articles', 'published', { orderBy: 'summary', order: 'asc' })
    expect(bySummary?.entries.map(entry => entry.data.summary)).toEqual(['a', 'b', 'c', 'd'])

    const limited = await service.listCollection('articles', 'published', { orderBy: 'title', order: 'asc', take: 2 })
    expect(limited?.entries.map(entry => entry.title)).toEqual(['alpha', 'Bravo'])
    // `total` counts every match, so it can drive a pager.
    expect(limited?.total).toBe(4)

    const page2 = await service.listCollection('articles', 'published', { orderBy: 'title', order: 'asc', take: 2, skip: 2 })
    expect(page2?.entries.map(entry => entry.title)).toEqual(['Charlie', 'Delta'])

    const drafts = await service.listCollection('articles', 'draft', { orderBy: 'title', order: 'asc' })
    expect(drafts?.total).toBe(5)

    expect(service.collectionSortKeys('articles')).toEqual(['updatedAt', 'publishedAt', 'title', 'slug', 'summary'])
    expect(service.collectionSortKeys('unknown')).toBeUndefined()
  })

  it('pushes entries without a sort value to the end', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)
    for (const [slug, summary] of [['with', 'zzz'], ['without', '']] as const) {
      await service.createCollectionEntry('articles', { title: slug, slug, summary })
      await service.patch(`articles/${slug}`, {}, 'publish')
    }

    // Empty values sink in both directions, so a blank summary never leads.
    for (const order of ['asc', 'desc'] as const) {
      const page = await service.listCollection('articles', 'published', { orderBy: 'summary', order })
      expect(page?.entries.map(entry => entry.slug)).toEqual(['with', 'without'])
    }
  })

  it('keeps validation failures and unknown entries intact', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)
    await expect(service.patch('homepage', { enabled: 'yes' })).resolves.toEqual({ errors: { enabled: ['Must be a boolean.'] } })
    await expect(service.patch('homepage', { tags: ['x', '', 'valid', 'extra'] })).resolves.toEqual({
      errors: {
        'tags': ['Must contain at most 3 items.'],
        'tags.0': ['Must contain at least 2 characters.'],
        'tags.1': ['This field is required.', 'Must contain at least 2 characters.'],
      },
    })
    await expect(service.patch('homepage', { tags: 'nuxt' })).resolves.toEqual({ errors: { tags: ['Must be an array.'] } })
    await expect(service.get('missing')).resolves.toBeUndefined()
  })

  it('creates, lists, publishes and deletes collection entries', async () => {
    const { client, rows } = createClient()
    const service = new EponymeService(config, client)

    await expect(service.createCollectionEntry('articles', { title: 'L’été à Paris' })).resolves.toMatchObject({
      slug: 'lete-a-paris',
      data: { title: 'L’été à Paris', slug: 'lete-a-paris', summary: '' },
      status: 'draft',
    })
    await expect(service.createCollectionEntry('articles', { title: 'Duplicate', slug: 'lete-a-paris' })).resolves.toEqual({
      errors: { slug: ['This slug is already in use.'] },
    })
    await expect(service.listCollection('articles', 'draft')).resolves.toMatchObject({
      entries: [{ slug: 'lete-a-paris', title: 'L’été à Paris', status: 'draft' }],
      total: 1,
    })
    await expect(service.get('articles/lete-a-paris')).resolves.toBeUndefined()
    await expect(service.patch('articles/lete-a-paris', {}, 'publish')).resolves.toMatchObject({ status: 'published' })
    await expect(service.get('articles/lete-a-paris')).resolves.toMatchObject({ title: 'L’été à Paris' })
    await service.patch('articles/lete-a-paris', { title: 'Private rewrite' }, 'draft')
    await expect(service.listCollection('articles')).resolves.toMatchObject({
      entries: [{ slug: 'lete-a-paris', title: 'L’été à Paris', data: { title: 'L’été à Paris' }, status: 'published' }],
      total: 1,
    })
    // Read on a cold service, so this still asserts one query per collection rather than one
    // per entry. The sitemap has its own cache key – it selects only the name and the date,
    // which no listing shares – so calling it twice still costs a single query.
    const findMany = vi.spyOn(client.eponyme, 'findMany')
    const cold = new EponymeService(config, client)
    const sitemap = await cold.getSitemapEntries({
      homepage: '/',
      articles: '/articles/:slug',
    })
    expect(findMany).toHaveBeenCalledTimes(1)
    await expect(cold.getSitemapEntries({ articles: '/articles/:slug' })).resolves.toHaveLength(1)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(sitemap).toEqual([
      { loc: '/' },
      { loc: '/articles/lete-a-paris', lastmod: expect.any(String) },
    ])
    await expect(service.get('articles/does-not-exist', 'draft')).resolves.toBeUndefined()
    expect(rows.has('articles/does-not-exist')).toBe(false)
    await expect(service.deleteCollectionEntry('articles/lete-a-paris')).resolves.toEqual({ deleted: true })
    expect(rows.has('articles/lete-a-paris')).toBe(true)
  })

  it('trashes, restores and purges a collection entry', async () => {
    const { client, rows, versions } = createClient()
    const service = new EponymeService(config, client)

    await service.createCollectionEntry('articles', { title: 'L’été à Paris' })
    await service.patch('articles/lete-a-paris', {}, 'publish')
    expect(versions.filter(version => version.entryName === 'articles/lete-a-paris')).toHaveLength(2)

    await expect(service.deleteCollectionEntry('articles/lete-a-paris')).resolves.toEqual({ deleted: true })
    // A trashed entry reads as missing everywhere a visitor or an editor could see it.
    await expect(service.get('articles/lete-a-paris')).resolves.toBeUndefined()
    await expect(service.get('articles/lete-a-paris', 'draft')).resolves.toBeUndefined()
    await expect(service.listCollection('articles', 'draft')).resolves.toEqual({ entries: [], total: 0 })
    await expect(service.getSitemapEntries({ articles: '/articles/:slug' })).resolves.toEqual([])
    await expect(service.patch('articles/lete-a-paris', { title: 'Nope' })).resolves.toBeUndefined()
    await expect(service.listCollectionTrash('articles')).resolves.toMatchObject({
      entries: [{ slug: 'lete-a-paris', title: 'L’été à Paris', deletedAt: expect.any(String) }],
      total: 1,
    })
    // Deleting twice is a no-op rather than a second, later deletion date.
    await expect(service.deleteCollectionEntry('articles/lete-a-paris')).resolves.toBeUndefined()
    // The slug stays reserved, with a message that says what to do about it.
    await expect(service.createCollectionEntry('articles', { title: 'Retake', slug: 'lete-a-paris' })).resolves.toEqual({
      errors: { slug: ['An entry with this slug is in the trash. Restore it or delete it permanently first.'] },
    })
    // Purging is refused while the entry is live, and only ever runs from the trash.
    await expect(service.purgeCollectionEntry('articles/does-not-exist')).resolves.toBe(false)

    await expect(service.restoreCollectionEntry('articles/lete-a-paris')).resolves.toBe(true)
    await expect(service.restoreCollectionEntry('articles/lete-a-paris')).resolves.toBe(false)
    await expect(service.get('articles/lete-a-paris')).resolves.toMatchObject({ title: 'L’été à Paris' })
    await expect(service.listCollectionTrash('articles')).resolves.toEqual({ entries: [], total: 0 })
    await expect(service.history('articles/lete-a-paris')).resolves.toHaveLength(2)
    await expect(service.purgeCollectionEntry('articles/lete-a-paris')).resolves.toBe(false)

    await service.deleteCollectionEntry('articles/lete-a-paris')
    await expect(service.purgeCollectionEntry('articles/lete-a-paris')).resolves.toBe(true)
    expect(rows.has('articles/lete-a-paris')).toBe(false)
    expect(versions.filter(version => version.entryName === 'articles/lete-a-paris')).toHaveLength(0)
    // The slug is free again.
    await expect(service.createCollectionEntry('articles', { title: 'Retake', slug: 'lete-a-paris' })).resolves.toMatchObject({ slug: 'lete-a-paris' })
  })

  it('writes an entry and its history version as one transaction', async () => {
    const { client, rows, versions, auditEvents, transactionCount } = createClient({ title: 'Welcome' })
    const service = new EponymeService(config, client)

    await service.createCollectionEntry('articles', { title: 'L’été à Paris' }, { id: 'user-1', username: 'Alice' })
    expect(transactionCount()).toBe(1)
    expect(auditEvents).toMatchObject([{
      actorUserId: 'user-1',
      actorUsername: 'Alice',
      action: 'content.created',
      resourceType: 'collection',
      resourceName: 'articles/lete-a-paris',
    }])
    await service.patch('articles/lete-a-paris', { title: 'Renamed' }, 'publish', { id: 'user-1', username: 'Alice' })
    expect(transactionCount()).toBe(2)
    const [firstVersion] = versions.filter(version => version.entryName === 'articles/lete-a-paris')
    await service.restore('articles/lete-a-paris', firstVersion!.id)
    expect(transactionCount()).toBe(3)
    expect(versions).toHaveLength(3)

    // The history failing has to take the content down with it, otherwise the entry
    // moves on with a timeline that never recorded the change.
    const stored = structuredClone(rows.get('articles/lete-a-paris'))
    vi.spyOn(client.eponymeVersion, 'create').mockRejectedValueOnce(new Error('history is down'))
    await expect(service.patch('articles/lete-a-paris', { title: 'Lost' }, 'publish')).rejects.toThrow('history is down')
    expect(rows.get('articles/lete-a-paris')).toEqual(stored)
    expect(versions).toHaveLength(3)
    expect(auditEvents).toHaveLength(3)
    // The cached row was dropped even though the write rolled back, so the next read
    // goes back to the database rather than trusting a key it may have re-cached.
    // The restore above put the first version back, and the failed patch changed nothing.
    await expect(service.get('articles/lete-a-paris', 'draft')).resolves.toMatchObject({ title: 'L’été à Paris' })

    // The audit row belongs to the same transaction too. If it cannot be persisted,
    // neither the content nor its history may claim the operation succeeded.
    vi.spyOn(client.eponymeAuditEvent, 'create').mockRejectedValueOnce(new Error('audit is down'))
    await expect(service.patch('articles/lete-a-paris', { title: 'Still lost' }, 'publish', { id: 'user-1', username: 'Alice' }))
      .rejects.toThrow('audit is down')
    expect(rows.get('articles/lete-a-paris')).toEqual(stored)
    expect(versions).toHaveLength(3)
    expect(auditEvents).toHaveLength(3)
  })

  it('rolls an import back as a whole', async () => {
    const { client, rows, versions, transactionCount } = createClient({ title: 'Welcome' })
    const service = new EponymeService(config, client)
    await service.createCollectionEntry('articles', { title: 'L’été à Paris' })
    const file = await service.exportContent()

    const opened = transactionCount()
    await expect(service.importContent(file, { dryRun: true })).resolves.toMatchObject({ dryRun: true })
    expect(transactionCount()).toBe(opened)

    const before = structuredClone([...rows.entries()])
    const versionCount = versions.length
    vi.spyOn(client.eponyme, 'upsert').mockRejectedValueOnce(new Error('connection lost'))
    await expect(service.importContent(file)).rejects.toThrow('connection lost')
    // Nothing landed, so the interrupted import can simply be replayed.
    expect([...rows.entries()]).toEqual(before)
    expect(versions).toHaveLength(versionCount)
    await expect(service.importContent(file)).resolves.toMatchObject({ created: 0, skipped: [] })
  })

  it('refuses to trash anything that is not a collection entry', async () => {
    const { client } = createClient({ title: 'Welcome' })
    const service = new EponymeService(config, client)

    await expect(service.deleteCollectionEntry('homepage')).resolves.toBeUndefined()
    await expect(service.restoreCollectionEntry('homepage')).resolves.toBe(false)
    await expect(service.purgeCollectionEntry('homepage')).resolves.toBe(false)
    await expect(service.listCollectionTrash('nope')).resolves.toBeUndefined()
  })

  it('creates and validates sections and multi-field arrays', () => {
    const schema = {
      hero: field.section({
        label: 'Hero',
        fields: {
          title: field.string({ label: 'Title', required: true, defaultValue: 'Welcome' }),
          published: field.boolean({ defaultValue: true }),
          theme: field.select({ options: [{ label: 'Warm', value: 'warm' }, { label: 'Dark', value: 'dark' }], defaultValue: 'warm' }),
          launchDate: field.date({ defaultValue: '2026-09-01' }),
          accentColor: field.color({ defaultValue: '#171714' }),
        },
      }),
      projects: field.array({
        of: {
          title: field.string({ label: 'Project title', required: true }),
          category: field.string({ required: true }),
        },
        defaultValue: [{ title: 'Atelier North', category: 'Brand identity' }],
      }),
    }

    expect(createDefaultEponymeData(schema)).toEqual({
      hero: { title: 'Welcome', published: true, theme: 'warm', launchDate: '2026-09-01', accentColor: '#171714' },
      projects: [{ title: 'Atelier North', category: 'Brand identity' }],
    })
    expect(validateEponymeData(schema, {
      hero: { title: '', published: true, theme: 'blue', launchDate: '2026-02-30', accentColor: 'red', unknown: true },
      projects: [{ title: '', category: 'Brand identity', unknown: true }],
    })).toEqual({
      'hero.unknown': ['Unknown field.'],
      'hero.title': ['This field is required.'],
      'hero.theme': ['Must be one of the available options.'],
      'hero.launchDate': ['Must be a valid date.'],
      'hero.accentColor': ['Must be a valid hex color.'],
      'projects.0.unknown': ['Unknown field.'],
      'projects.0.title': ['This field is required.'],
    })
  })

  it('resolves today date defaults when data is created', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 6, 19, 23, 30))
      const schema = { publishedOn: field.date({ defaultValue: today() }) }

      vi.setSystemTime(new Date(2026, 6, 20, 0, 30))
      expect(createDefaultEponymeData(schema)).toEqual({ publishedOn: '2026-07-20' })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('creates tabs and skips hidden field validation', () => {
    const schema = {
      enabled: field.boolean({ defaultValue: false }),
      conditionalTitle: field.string({ required: true, visibleWhen: { field: 'enabled', equals: true } }),
      options: field.tab({
        tabs: {
          seo: {
            label: 'SEO',
            fields: {
              title: field.string({ required: true, defaultValue: 'SEO title' }),
            },
          },
        },
      }),
    }

    expect(createDefaultEponymeData(schema)).toEqual({
      enabled: false,
      conditionalTitle: '',
      options: { seo: { title: 'SEO title' } },
    })
    expect(validateEponymeData(schema, {
      enabled: false,
      conditionalTitle: '',
      options: { seo: { title: '' } },
    })).toEqual({ 'options.seo.title': ['This field is required.'] })
  })

  it('validates radio, checkbox groups and custom rules', () => {
    const schema = {
      layout: field.radio({
        options: [{ label: 'Grid', value: 'grid' }, { label: 'List', value: 'list' }],
        defaultValue: 'grid',
      }),
      sections: field.checkboxGroup({
        options: [{ label: 'Hero', value: 'hero' }, { label: 'Projects', value: 'projects' }],
        minItems: 1,
        maxItems: 2,
        defaultValue: ['hero'],
      }),
      title: field.string({
        validate: (value, data) => value !== data.layout ? true : 'Title must differ from the layout.',
      }),
    }

    expect(createDefaultEponymeData(schema)).toEqual({ layout: 'grid', sections: ['hero'], title: '' })
    expect(validateEponymeData(schema, { layout: 'cards', sections: [], title: 'grid' })).toEqual({
      layout: ['Must be one of the available options.'],
      sections: ['Must contain at least 1 items.'],
    })
    expect(validateEponymeData(schema, { layout: 'grid', sections: ['hero'], title: 'grid' })).toEqual({
      title: ['Title must differ from the layout.'],
    })
  })

  it('keeps the slider as an optional number presentation', () => {
    const schema = {
      width: field.number({ min: 640, max: 1440, step: 20, slider: true, defaultValue: 960 }),
    }

    expect(schema.width).toEqual({
      type: 'number',
      options: { min: 640, max: 1440, step: 20, slider: true, defaultValue: 960 },
    })
    expect(createDefaultEponymeData(schema)).toEqual({ width: 960 })
    expect(validateEponymeData(schema, { width: 1460 })).toEqual({ width: ['Must be at most 1440.'] })
  })

  it('creates and validates specialized email and URL fields', () => {
    const schema = {
      email: field.email({ required: true, defaultValue: 'hello@example.com' }),
      link: field.url({
        required: true,
        defaultValue: { href: '/contact', type: 'internal', openInNewTab: false },
      }),
    }

    expect(createDefaultEponymeData(schema)).toEqual({
      email: 'hello@example.com',
      link: { href: '/contact', type: 'internal', openInNewTab: false },
    })
    expect(validateEponymeData(schema, {
      email: 'invalid',
      link: { href: 'contact', type: 'internal', openInNewTab: false },
    })).toEqual({
      email: ['Must be a valid email address.'],
      link: ['Internal links must start with / or #.'],
    })
    expect(validateEponymeData(schema, {
      email: 'hello@example.com',
      link: { href: 'https://example.com', type: 'external', openInNewTab: true },
    })).toEqual({})
  })

  it('creates and validates rich text fields from their readable content', () => {
    const schema = {
      body: field.richText({ required: true, defaultValue: '<p>Hello <strong>world</strong>.</p>' }),
      summary: field.richText({ minLength: 5, maxLength: 20 }),
    }

    expect(createDefaultEponymeData(schema)).toEqual({
      body: '<p>Hello <strong>world</strong>.</p>',
      summary: '',
    })
    expect(validateEponymeData(schema, {
      body: '<p><br></p>',
      summary: '<p>Hi</p>',
    })).toEqual({
      body: ['This field is required.'],
      summary: ['Must contain at least 5 characters.'],
    })
  })

  it('creates, normalizes and validates slug fields', () => {
    const schema = {
      slug: field.slug({ required: true, defaultValue: 'hello-world', minLength: 3, maxLength: 30 }),
    }

    expect(schema.slug).toEqual({
      type: 'slug',
      options: { required: true, defaultValue: 'hello-world', minLength: 3, maxLength: 30 },
    })
    expect(createDefaultEponymeData(schema)).toEqual({ slug: 'hello-world' })
    expect(normalizeSlug('  L\'été à Paris !  ')).toBe('lete-a-paris')
    expect(validateEponymeData(schema, { slug: 'Hello world' })).toEqual({
      slug: ['Must contain only lowercase letters, numbers and single hyphens.'],
    })
    expect(validateEponymeData(schema, { slug: 'hello-world' })).toEqual({})
  })
})

describe('Eponyme export and import', () => {
  async function seed() {
    const { client, rows, versions, deletions } = createClient()
    const service = new EponymeService(config, client)
    await service.syncAll()
    await service.patch('homepage', { title: 'Live homepage' })
    await service.createCollectionEntry('articles', { title: 'Été à Paris', summary: 'Draft summary' })
    await service.patch('articles/ete-a-paris', { summary: 'Published summary' }, 'publish')
    await service.createCollectionEntry('articles', { title: 'Still a draft' })
    return { service, client, rows, versions, deletions }
  }

  it('exports every singleton and live collection entry with its complete state', async () => {
    const { service } = await seed()

    const file = await service.exportContent()

    expect(file.eponyme.format).toBe(1)
    expect(Object.keys(file.eponyme.schemas).sort()).toEqual(['articles', 'homepage'])
    expect(file.entries.map(entry => entry.name).sort()).toEqual([
      'articles/ete-a-paris',
      'articles/still-a-draft',
      'homepage',
    ])
    const article = file.entries.find(entry => entry.name === 'articles/ete-a-paris')!
    expect(article.collection).toBe('articles')
    expect(article.status).toBe('published')
    expect(article.draft.summary).toBe('Published summary')
    // A never-published entry keeps its draft, which is the point of exporting the full state.
    const draft = file.entries.find(entry => entry.name === 'articles/still-a-draft')!
    expect(draft.status).toBe('draft')
    expect(draft.publishedAt).toBeNull()
  })

  it('leaves the trash out of the export', async () => {
    const { service } = await seed()
    await service.deleteCollectionEntry('articles/still-a-draft')

    const file = await service.exportContent()

    expect(file.entries.map(entry => entry.name)).not.toContain('articles/still-a-draft')
  })

  it('applies an export onto another instance without touching what the file does not carry', async () => {
    const { service: source } = await seed()
    const file = await source.exportContent()

    const { client, rows } = createClient()
    const target = new EponymeService(config, client)
    await target.syncAll()
    await target.createCollectionEntry('articles', { title: 'Only on the target' })

    const result = await target.importContent(file, { actorId: 'user-1' })

    expect(result).toMatchObject({ dryRun: false, created: 2, updated: 1, skipped: [] })
    await expect(target.get('homepage')).resolves.toMatchObject({ title: 'Live homepage' })
    await expect(target.get('articles/ete-a-paris')).resolves.toMatchObject({ summary: 'Published summary' })
    // Nothing is ever deleted: an entry the file never mentioned stays untouched.
    expect(rows.has('articles/only-on-the-target')).toBe(true)
  })

  it('records one history version per imported entry, so an import stays reversible', async () => {
    const { service: source } = await seed()
    const file = await source.exportContent()
    const { client } = createClient()
    const target = new EponymeService(config, client)
    await target.syncAll()

    await target.importContent(file, { actorId: 'user-2' })

    const history = await target.history('articles/ete-a-paris')
    expect(history).toMatchObject([{ action: 'import', status: 'published', user: { username: 'Bob' } }])
  })

  it('refuses the whole import when the configured schema differs', async () => {
    const { service: source } = await seed()
    const file = await source.exportContent()
    const { client, rows } = createClient()
    const divergent = defineEponymeConfig({
      homepage: {
        title: field.string({ required: true, defaultValue: 'Welcome' }),
        enabled: field.boolean({ defaultValue: true }),
        // `tags` went from an array of strings to a plain string.
        tags: field.string(),
      },
      articles: collection({
        label: 'Articles',
        titleField: 'title',
        slugField: 'slug',
        fields: {
          title: field.string({ required: true }),
          slug: field.slug({ required: true }),
          summary: field.textarea(),
        },
      }),
    })
    const target = new EponymeService(divergent, client)
    await target.syncAll()
    const before = new Map(rows)

    const result = await target.importContent(file)

    expect(result).toMatchObject({ errors: expect.any(Array), schemaMismatch: ['homepage'] })
    // Refused before the first write: nothing moved, not even the entries that matched.
    expect([...rows.entries()]).toEqual([...before.entries()])
  })

  it('reads a relation by its target collection and arity, since both change what a value means', () => {
    const single = { author: field.relation({ to: 'authors' }) }
    expect(schemaFingerprint({ author: field.relation({ to: 'people' }) })).not.toBe(schemaFingerprint(single))
    expect(schemaFingerprint({ author: field.relation({ to: 'authors', multiple: true }) })).not.toBe(schemaFingerprint(single))
    expect(schemaFingerprint({ author: field.relation({ to: 'authors', placeholder: 'Pick one' }) })).toBe(schemaFingerprint(single))
  })

  it('ignores relabelled fields, since only the shape of a schema matters', () => {
    const before = { title: field.string({ label: 'Title', required: true }) }
    const after = { title: field.string({ label: 'Headline', placeholder: 'Type here' }) }
    expect(schemaFingerprint(after)).toBe(schemaFingerprint(before))
    expect(schemaFingerprint({ title: field.textarea() })).not.toBe(schemaFingerprint(before))
  })

  it('ignores the site-wide constants a seo preset carries, but not the fields it emits', () => {
    const plain = { seo: field.seo() }
    expect(schemaFingerprint({ seo: field.seo({ siteName: 'Karibsen', themeColor: '#111111' }) }))
      .toBe(schemaFingerprint(plain))
    expect(schemaFingerprint({ seo: field.seo({ social: false }) })).not.toBe(schemaFingerprint(plain))
  })

  it('reports what a dry run would do without writing anything', async () => {
    const { service: source } = await seed()
    const file = await source.exportContent()
    const { client, rows, versions } = createClient()
    const target = new EponymeService(config, client)
    await target.syncAll()
    const before = new Map(rows)

    const result = await target.importContent(file, { dryRun: true })

    expect(result).toMatchObject({ dryRun: true, created: 2, updated: 1 })
    expect([...rows.entries()]).toEqual([...before.entries()])
    expect(versions).toHaveLength(0)
  })

  it('skips a trashed entry and an entry whose collection is not configured', async () => {
    const { service: source } = await seed()
    const file = await source.exportContent()
    const { client } = createClient()
    const target = new EponymeService(config, client)
    await target.syncAll()
    await target.createCollectionEntry('articles', { title: 'Été à Paris' })
    await target.deleteCollectionEntry('articles/ete-a-paris')
    file.entries.push({ ...file.entries[0]!, name: 'unknown/entry', collection: 'unknown' })
    file.eponyme.schemas.unknown = schemaFingerprint({})

    const result = await target.importContent(file)

    expect(result).toMatchObject({ schemaMismatch: ['unknown'] })

    // Without the unknown collection, the trashed entry alone is skipped.
    file.entries.pop()
    delete file.eponyme.schemas.unknown
    const applied = await target.importContent(file) as Exclude<Awaited<ReturnType<EponymeService['importContent']>>, { errors: string[] }>
    expect(applied.skipped).toEqual([
      { name: 'articles/ete-a-paris', reason: expect.stringContaining('trash') },
    ])
    expect(applied.created).toBe(1)
    expect(applied.updated).toBe(1)
  })

  it('reports whether an imported entry was published, so the route can purge what it takes down', async () => {
    const { service: source } = await seed()
    const file = await source.exportContent()
    // The entry leaves the public site: exported as a draft, published on the target.
    file.entries.find(entry => entry.name === 'articles/ete-a-paris')!.status = 'draft'

    const { client } = createClient()
    const target = new EponymeService(config, client)
    await target.syncAll()
    await target.createCollectionEntry('articles', { title: 'Été à Paris', summary: 'Live' })
    await target.patch('articles/ete-a-paris', { summary: 'Live' }, 'publish')

    const applied = await target.importContent(file) as Exclude<Awaited<ReturnType<EponymeService['importContent']>>, { errors: string[] }>

    expect(applied.written).toContainEqual(expect.objectContaining({
      name: 'articles/ete-a-paris',
      status: 'draft',
      wasPublished: true,
    }))
    // A creation has no previous state, so it never reads as an unpublication.
    expect(applied.written).toContainEqual(expect.objectContaining({ name: 'articles/still-a-draft', wasPublished: false }))
  })

  it('refuses a file whose relations point at an entry neither it nor the application holds', async () => {
    const related = defineEponymeConfig({
      homepage: { author: field.relation({ to: 'articles' }) },
      articles: collection({
        label: 'Articles',
        titleField: 'title',
        slugField: 'slug',
        fields: { title: field.string({ required: true }), slug: field.slug({ required: true }) },
      }),
    })
    const { client, rows } = createClient()
    const target = new EponymeService(related, client)
    await target.syncAll()

    const file: EponymeExportFile = {
      eponyme: {
        format: 1,
        exportedAt: new Date().toISOString(),
        schemas: { homepage: schemaFingerprint(related.homepage), articles: schemaFingerprint(related.articles.fields) },
      },
      entries: [{
        name: 'homepage',
        draft: { author: 'ete-a-paris' },
        published: {},
        status: 'draft',
        publishedAt: null,
        scheduledPublishAt: null,
        scheduledUnpublishAt: null,
      }],
    }
    const before = new Map(rows)

    await expect(target.importContent(file)).resolves.toMatchObject({ errors: [expect.stringContaining('ete-a-paris')] })
    expect([...rows.entries()]).toEqual([...before.entries()])

    // The same file becomes importable once it carries the entry it points at.
    file.entries.push({
      name: 'articles/ete-a-paris',
      collection: 'articles',
      draft: { title: 'Été à Paris', slug: 'ete-a-paris' },
      published: {},
      status: 'draft',
      publishedAt: null,
      scheduledPublishAt: null,
      scheduledUnpublishAt: null,
    })
    await expect(target.importContent(file)).resolves.toMatchObject({ created: 1, updated: 1 })
  })

  it('rejects a file that is not an Eponyme export', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)

    await expect(service.importContent({ entries: [] })).resolves.toMatchObject({ errors: [expect.any(String)] })
    await expect(service.importContent(null)).resolves.toMatchObject({ errors: [expect.any(String)] })
    const malformed = { eponyme: { format: 1, exportedAt: '', schemas: {} }, entries: [{ name: 'homepage' }] } as unknown as EponymeExportFile
    await expect(service.importContent(malformed)).resolves.toMatchObject({ errors: [expect.any(String)] })
  })
})

/**
 * Rendering a public page costs one database round trip per query, so the number of
 * queries a read sends is the number that matters, not how long the fake client takes.
 * These assert the count directly.
 */
describe('EponymeService query count', () => {
  async function seedArticles(count: number) {
    const harness = createClient()
    const service = new EponymeService(config, harness.client)
    await service.syncAll()
    for (let index = 0; index < count; index++) {
      const slug = `article-${index}`
      await service.createCollectionEntry('articles', { title: `Article ${index}`, slug })
      await service.patch(`articles/${slug}`, { title: `Article ${index}` }, 'publish')
    }
    harness.resetCounts()
    return { ...harness, service }
  }

  it('reads a singleton without writing', async () => {
    const { service, counts, writeCount, resetCounts } = await seedArticles(0)

    await service.getResult('homepage', 'published')

    expect(writeCount()).toBe(0)
    expect(counts.total).toBe(1)

    resetCounts()
    await service.getResult('homepage', 'published')
    expect(counts.total ?? 0).toBe(0)
  })

  it('lists a collection with a single query, whatever its size', async () => {
    const { service, counts } = await seedArticles(5)

    const page = await service.listCollection('articles', 'published')

    expect(page!.entries).toHaveLength(5)
    // One query for the page and one for the total, whatever the size of the collection –
    // never one per entry. The count is what lets `take` be applied in SQL while `total`
    // still describes everything that matched.
    expect(counts['eponyme.findMany']).toBe(1)
    expect(counts['eponyme.count']).toBe(1)
    expect(counts.total).toBe(2)
  })

  it('paginates in SQL, and falls back to memory only for a content sort', async () => {
    const { service, client, counts, resetCounts } = await seedArticles(5)
    const rowsRead = () => (vi.mocked(client.eponyme.findMany).mock.results.at(-1)!.value as Promise<unknown[]>)

    // Ordering on a column: the database applies `take`, so only the page is read.
    vi.spyOn(client.eponyme, 'findMany')
    const page = await service.listCollection('articles', 'published', { take: 2, orderBy: 'updatedAt', order: 'desc' })
    expect(page!.entries).toHaveLength(2)
    // `total` still describes everything that matched, which is what a pager needs.
    expect(page!.total).toBe(5)
    await expect(rowsRead()).resolves.toHaveLength(2)
    expect(counts['eponyme.findMany']).toBe(1)
    expect(counts['eponyme.count']).toBe(1)

    // A public listing selects the published column and never the draft one, so draft
    // content is not filtered out of the response – it is never read.
    const [row] = await rowsRead() as Array<Record<string, unknown>>
    expect(Object.keys(row!).sort()).toEqual([
      'name',
      'publishedAt',
      'published',
      'scheduledPublishAt',
      'scheduledUnpublishAt',
      'status',
      'updatedAt',
    ].sort())

    // Ordering on a content field: that value lives in the JSON payload, so the whole
    // matching set has to be read and sorted here instead.
    resetCounts()
    const byTitle = await service.listCollection('articles', 'published', { take: 2, orderBy: 'title', order: 'asc' })
    expect(byTitle!.entries.map(entry => entry.title)).toEqual(['Article 0', 'Article 1'])
    expect(byTitle!.total).toBe(5)
    await expect(rowsRead()).resolves.toHaveLength(5)
    expect(counts['eponyme.count'] ?? 0).toBe(0)
  })

  it('agrees with itself whichever mode a listing takes', async () => {
    const { service } = await seedArticles(5)
    // The two paths must be interchangeable where they overlap, or pushing a sort down would
    // quietly reorder a listing that already shipped.
    const pushed = await service.listCollection('articles', 'published', { orderBy: 'updatedAt', order: 'desc' })
    const memory = await service.listCollection('articles', 'published', { orderBy: 'title', order: 'asc' })
    expect(pushed!.total).toBe(memory!.total)
    expect(pushed!.entries.map(entry => entry.slug).sort()).toEqual(memory!.entries.map(entry => entry.slug).sort())
  })

  it('does not re-read the same entry twice in a row', async () => {
    const { service, counts } = await seedArticles(1)

    await service.getResult('articles/article-0', 'published')
    await service.getResult('articles/article-0', 'published')
    await service.get('articles/article-0', 'published')

    expect(counts.total).toBe(1)
  })

  it('serves fresh content after a write', async () => {
    const { service } = await seedArticles(0)

    await service.getResult('homepage', 'published')
    await service.patch('homepage', { title: 'Updated' }, 'publish')

    await expect(service.get('homepage', 'published')).resolves.toMatchObject({ title: 'Updated' })
  })

  it('serves a fresh listing after an entry is created, published, deleted and restored', async () => {
    const { service } = await seedArticles(1)
    const published = () => service.listCollection('articles', 'published')

    // Each step primes the cache, then changes the row set behind it.
    await expect(published()).resolves.toMatchObject({ total: 1 })
    await service.createCollectionEntry('articles', { title: 'Fresh', slug: 'fresh' })
    await expect(published()).resolves.toMatchObject({ total: 1 })

    await service.patch('articles/fresh', {}, 'publish')
    await expect(published()).resolves.toMatchObject({ total: 2 })

    await service.deleteCollectionEntry('articles/fresh')
    await expect(published()).resolves.toMatchObject({ total: 1 })

    await service.restoreCollectionEntry('articles/fresh')
    await expect(published()).resolves.toMatchObject({ total: 2 })

    // Purging only acts on a trashed entry, so it has to go back to the trash first.
    await service.deleteCollectionEntry('articles/fresh')
    await service.purgeCollectionEntry('articles/fresh')
    await expect(published()).resolves.toMatchObject({ total: 1 })
    await expect(service.getResult('articles/fresh', 'published')).resolves.toBeUndefined()
  })

  it('never serves a draft from the cache, so the preview panel shows a save immediately', async () => {
    const { service, counts } = await seedArticles(0)

    await service.getResult('homepage', 'draft')
    await service.getResult('homepage', 'draft')

    // Two reads, two queries: draft content is dashboard-only and must stay exact.
    expect(counts['eponyme.findUnique']).toBe(2)
  })
})

describe('entry index', () => {
  const indexed = defineEponymeConfig({
    posts: collection({
      label: 'Posts',
      titleField: 'title',
      slugField: 'slug',
      fields: {
        title: field.string({ required: true }),
        slug: field.slug({ required: true }),
        body: field.textarea(),
        tags: field.tags({ suggestions: ['Nuxt', 'Vue'], allowCustom: true }),
        section: field.select({ options: [{ label: 'News', value: 'news' }, { label: 'Guide', value: 'guide' }], defaultValue: 'news' }),
        featured: field.boolean({ defaultValue: false }),
        publishedOn: field.date(),
      },
    }),
  })
  const rowsFor = (index: Map<string, EponymeIndexRow>, version: 'draft' | 'published') =>
    [...index.values()].filter(row => row.version === version).map(row => `${row.key}=${row.value}`).sort()

  it('indexes only the field types a filter can compare', () => {
    const rows = buildEponymeIndexRows('posts/hello', indexed.posts.fields, {
      draft: { title: 'Hello', slug: 'hello', body: 'A long paragraph.', tags: ['Nuxt', 'nuxt', ' Vue '], section: 'guide', featured: true, publishedOn: '2026-03-14' },
      published: {},
    })

    expect(rows.map(row => `${row.key}=${row.value}`).sort()).toEqual([
      'featured=true',
      'publishedOn=2026-03-14',
      'section=guide',
      'tags=nuxt',
      'tags=vue',
    ])
    // `title` and `body` are free text and `slug` is the identity: none is filterable.
    expect(rows.every(row => row.version === 'draft')).toBe(true)
    // Two spellings of one tag fold onto one row rather than colliding on the primary key.
    expect(rows.filter(row => row.key === 'tags')).toHaveLength(2)
  })

  it('rewrites the rows of an entry on every write, in the same transaction', async () => {
    const { client, indexRows } = createClient()
    const service = new EponymeService(indexed, client)

    await service.createCollectionEntry('posts', { title: 'Hello', tags: ['Nuxt'], publishedOn: '2026-03-14' })
    expect(rowsFor(indexRows, 'draft')).toEqual(['featured=false', 'publishedOn=2026-03-14', 'section=news', 'tags=nuxt'])
    // A new entry is a draft, so only the defaults are visible to a published listing.
    expect(rowsFor(indexRows, 'published')).toEqual(['featured=false', 'section=news'])

    await service.patch('posts/hello', { tags: ['Vue'], featured: true }, 'publish')
    // The rows are replaced, not merged: the tag that was dropped is gone from both.
    expect(rowsFor(indexRows, 'draft')).toEqual(['featured=true', 'publishedOn=2026-03-14', 'section=news', 'tags=vue'])
    expect(rowsFor(indexRows, 'published')).toEqual(['featured=true', 'publishedOn=2026-03-14', 'section=news', 'tags=vue'])

    // A failed write leaves the index exactly as the content it describes.
    const before = rowsFor(indexRows, 'draft')
    vi.spyOn(client.eponymeVersion, 'create').mockRejectedValueOnce(new Error('history is down'))
    await expect(service.patch('posts/hello', { tags: ['Svelte'] })).rejects.toThrow('history is down')
    expect(rowsFor(indexRows, 'draft')).toEqual(before)

    // Purging cascades, as the foreign key does.
    await service.deleteCollectionEntry('posts/hello')
    await service.purgeCollectionEntry('posts/hello')
    expect(indexRows.size).toBe(0)
  })

  it('rebuilds every entry on demand, for a backfill', async () => {
    const { client, indexRows } = createClient()
    const service = new EponymeService(indexed, client)

    await service.createCollectionEntry('posts', { title: 'Hello', tags: ['Nuxt'] })
    await service.createCollectionEntry('posts', { title: 'World', tags: ['Vue'] })
    indexRows.clear()

    await expect(service.reindexAll()).resolves.toEqual({ entries: 2 })
    expect(rowsFor(indexRows, 'draft').filter(row => row.startsWith('tags='))).toEqual(['tags=nuxt', 'tags=vue'])
    // A trashed entry keeps its rows: nothing reads them, and restoring must not need a rebuild.
    await service.deleteCollectionEntry('posts/hello')
    await expect(service.reindexAll()).resolves.toEqual({ entries: 1 })
  })

  it('filters a listing from the index, without reading the rest of the collection', async () => {
    const { client, resetCounts, counts } = createClient()
    const service = new EponymeService(indexed, client)

    await service.createCollectionEntry('posts', { title: 'Nuxt in March', tags: ['Nuxt'], section: 'guide', publishedOn: '2026-03-14' })
    await service.createCollectionEntry('posts', { title: 'Vue in June', tags: ['Vue'], section: 'guide', publishedOn: '2026-06-02' })
    await service.createCollectionEntry('posts', { title: 'Nuxt in September', tags: ['nuxt', 'Vue'], section: 'news', publishedOn: '2026-09-30' })
    const titles = async (where: Record<string, EponymeFilterCondition>) =>
      (await service.listCollection('posts', 'draft', { where }))!.entries.map(entry => entry.title).sort()

    // The spelling stored first wins on write, so the filter has to ignore case to find both.
    await expect(titles({ tags: 'NUXT' })).resolves.toEqual(['Nuxt in March', 'Nuxt in September'])
    // Keys are ANDed, values of one key are ORed.
    await expect(titles({ tags: ['nuxt', 'vue'], section: 'guide' })).resolves.toEqual(['Nuxt in March', 'Vue in June'])
    await expect(titles({ tags: 'nuxt', section: 'news' })).resolves.toEqual(['Nuxt in September'])
    // A range on a date, which only works because validation pins the format.
    await expect(titles({ publishedOn: { gte: '2026-02-01', lte: '2026-06-30' } })).resolves.toEqual(['Nuxt in March', 'Vue in June'])
    await expect(titles({ publishedOn: { gt: '2026-06-02' } })).resolves.toEqual(['Nuxt in September'])
    await expect(titles({ featured: 'true' })).resolves.toEqual([])

    // The whole point: a filtered listing reads the entries it returns, not the collection.
    resetCounts()
    const page = await service.listCollection('posts', 'draft', { where: { tags: 'nuxt', section: 'news' } })
    expect(page).toMatchObject({ total: 1 })
    expect(counts['eponymeEntryIndex.findMany']).toBe(2)
    expect(counts['eponyme.findMany']).toBe(1)

    // A filter that matches nothing never touches the content table at all.
    resetCounts()
    await expect(service.listCollection('posts', 'draft', { where: { tags: 'svelte' } })).resolves.toEqual({ entries: [], total: 0 })
    expect(counts['eponyme.findMany'] ?? 0).toBe(0)
  })

  it('excludes with `not` and matches a substring with `contains`', async () => {
    const { client, resetCounts, counts } = createClient()
    const service = new EponymeService(indexed, client)

    await service.createCollectionEntry('posts', { title: 'Nuxt in March', tags: ['Nuxt'], section: 'guide', publishedOn: '2026-03-14' })
    await service.createCollectionEntry('posts', { title: 'Vue in June', tags: ['Vue'], section: 'guide', publishedOn: '2026-06-02' })
    await service.createCollectionEntry('posts', { title: 'Both in September', tags: ['Nuxt', 'Vue'], section: 'news', publishedOn: '2026-09-30' })
    // No tags at all: it has no index row for the key, so only a subtraction can find it.
    await service.createCollectionEntry('posts', { title: 'Untagged', section: 'news' })
    const titles = async (where: Record<string, EponymeFilterCondition>) =>
      (await service.listCollection('posts', 'draft', { where }))!.entries.map(entry => entry.title).sort()

    await expect(titles({ tags: { not: ['nuxt'] } })).resolves.toEqual(['Untagged', 'Vue in June'])
    // A positive and a negative on one key: narrow, then subtract.
    await expect(titles({ tags: { in: ['vue'], not: ['nuxt'] } })).resolves.toEqual(['Vue in June'])
    // Negations across keys accumulate.
    await expect(titles({ tags: { not: ['nuxt'] }, section: { not: ['news'] } })).resolves.toEqual(['Vue in June'])

    // `contains` on a date is a prefix in disguise: every entry of March 2026.
    await expect(titles({ publishedOn: { contains: '2026-03' } })).resolves.toEqual(['Nuxt in March'])
    await expect(titles({ tags: { contains: 'ux' } })).resolves.toEqual(['Both in September', 'Nuxt in March'])

    // A `where` made only of negations has to enumerate the collection, and reads names
    // rather than content to do it.
    resetCounts()
    await titles({ tags: { not: ['nuxt'] } })
    expect(counts['eponyme.findMany']).toBe(2)
    // With a positive condition to narrow first, that enumeration is not needed.
    resetCounts()
    await titles({ section: 'guide', tags: { not: ['nuxt'] } })
    expect(counts['eponyme.findMany']).toBe(1)
  })

  it('keeps a draft filter out of the published listing', async () => {
    const { client } = createClient()
    const service = new EponymeService(indexed, client)

    await service.createCollectionEntry('posts', { title: 'Draft', tags: ['Nuxt'] })
    // Unpublished: the tag exists on the draft only, and a public listing must not see it.
    await expect(service.listCollection('posts', 'published', { where: { tags: 'nuxt' } })).resolves.toEqual({ entries: [], total: 0 })
    await expect(service.listCollection('posts', 'draft', { where: { tags: 'nuxt' } })).resolves.toMatchObject({ total: 1 })

    await service.patch('posts/draft', {}, 'publish')
    await expect(service.listCollection('posts', 'published', { where: { tags: 'nuxt' } })).resolves.toMatchObject({ total: 1 })

    // A trashed entry keeps its index rows, and still has to read as missing.
    await service.deleteCollectionEntry('posts/draft')
    await expect(service.listCollection('posts', 'published', { where: { tags: 'nuxt' } })).resolves.toEqual({ entries: [], total: 0 })
  })

  it('rebuilds only what a configuration change invalidated', async () => {
    const { client, indexRows, indexState, counts, resetCounts } = createClient()
    // A collection with nothing filterable yet, and entries already stored.
    const before = defineEponymeConfig({
      posts: collection({ label: 'P', titleField: 'title', slugField: 'slug', fields: {
        title: field.string({ required: true }),
        slug: field.slug({ required: true }),
      } }),
    })
    await new EponymeService(before, client).createCollectionEntry('posts', { title: 'Old' })
    await new EponymeService(before, client).syncIndexState()
    expect([...indexRows.values()].filter(row => row.key === 'tags')).toEqual([])

    // The field becomes filterable. Its default is what the existing entry must be indexed on.
    const withTags = defineEponymeConfig({
      posts: collection({ label: 'P', titleField: 'title', slugField: 'slug', fields: {
        title: field.string({ required: true }),
        slug: field.slug({ required: true }),
        tags: field.tags({ suggestions: ['Nuxt'], defaultValue: ['Nuxt'] }),
      } }),
    })
    const service = new EponymeService(withTags, client)
    await expect(service.syncIndexState()).resolves.toEqual({ reindexed: ['posts'] })
    // The entry stored before the change is now filterable, without anyone running anything.
    await expect(service.listCollection('posts', 'draft', { where: { tags: 'nuxt' } })).resolves.toMatchObject({ total: 1 })

    // Booting again changes nothing: one read of the state table, no writes.
    resetCounts()
    await expect(service.syncIndexState()).resolves.toEqual({ reindexed: [] })
    expect(counts['eponymeIndexState.findMany']).toBe(1)
    expect(counts['eponymeEntryIndex.createMany'] ?? 0).toBe(0)
    expect(counts['eponymeEntryIndex.deleteMany'] ?? 0).toBe(0)

    // A collection dropped from the config leaves no fingerprint claiming an index for it.
    await new EponymeService(defineEponymeConfig({}), client).syncIndexState()
    expect(indexState.has('posts')).toBe(false)
  })

  it('separates a semantic option change from a cosmetic one', async () => {
    const build = (options: Parameters<typeof field.tags>[0]) => defineEponymeConfig({
      posts: collection({ label: 'P', titleField: 'title', slugField: 'slug', fields: {
        title: field.string({ required: true }),
        slug: field.slug({ required: true }),
        tags: field.tags(options),
      } }),
    })
    const { client } = createClient()
    await new EponymeService(build({ suggestions: ['Nuxt'], allowCustom: true }), client).syncIndexState()

    // A label is presentational: it cannot change what is stored, so it must not rebuild.
    const relabelled = new EponymeService(build({ suggestions: ['Nuxt'], allowCustom: true, label: 'Mots-clés' }), client)
    await expect(relabelled.syncIndexState()).resolves.toEqual({ reindexed: [] })

    // `allowCustom` is not: turning it off makes reconciliation drop values already stored.
    const closed = new EponymeService(build({ suggestions: ['Nuxt'], allowCustom: false }), client)
    await expect(closed.syncIndexState()).resolves.toEqual({ reindexed: ['posts'] })
  })

  it('leaves the fingerprint unwritten when a rebuild fails, so the next boot retries', async () => {
    const { client } = createClient()
    const config = defineEponymeConfig({
      posts: collection({ label: 'P', titleField: 'title', slugField: 'slug', fields: {
        title: field.string({ required: true }),
        slug: field.slug({ required: true }),
        tags: field.tags({ suggestions: ['Nuxt'] }),
      } }),
    })
    const service = new EponymeService(config, client)
    await service.createCollectionEntry('posts', { title: 'One', tags: ['Nuxt'] })

    vi.spyOn(client.eponymeEntryIndex, 'createMany').mockRejectedValueOnce(new Error('connection lost'))
    await expect(service.syncIndexState()).rejects.toThrow('connection lost')
    // Retried rather than assumed done.
    await expect(service.syncIndexState()).resolves.toEqual({ reindexed: ['posts'] })
    await expect(service.listCollection('posts', 'draft', { where: { tags: 'nuxt' } })).resolves.toMatchObject({ total: 1 })
  })

  it('reports the keys a filter may name', () => {
    const service = new EponymeService(indexed, createClient().client)
    expect(service.collectionFilterKeys('posts')).toEqual(['tags', 'section', 'featured', 'publishedOn'])
    expect(service.collectionFilterKeys('nope')).toBeUndefined()
  })
})

describe('rich text safety', () => {
  const html = defineEponymeConfig({
    page: {
      body: field.richText(),
      intro: field.section({ fields: { lead: field.richText() } }),
    },
    posts: collection({
      label: 'Posts',
      titleField: 'title',
      slugField: 'slug',
      fields: {
        title: field.string({ required: true }),
        slug: field.slug({ required: true }),
        body: field.richText(),
        blocks: field.array({ of: { text: field.richText() } }),
      },
    }),
  })

  it('refuses a save carrying markup the editor cannot produce, naming the field', async () => {
    const service = new EponymeService(html, createClient().client)
    await service.syncAll()

    await expect(service.patch('page', { body: '<p onclick="steal()">hi</p>' }, 'draft'))
      .resolves.toEqual({ errors: { body: [expect.stringContaining('not allowed')] } })
    // The path a nested field is reported under is the one the editor keys its errors by.
    await expect(service.patch('page', { intro: { lead: '<script>alert(1)</script>' } }, 'draft'))
      .resolves.toEqual({ errors: { 'intro.lead': [expect.stringContaining('not allowed')] } })
    // Refused means not written: the draft still holds what was there before.
    await expect(service.get('page')).resolves.toMatchObject({ body: '' })
  })

  it('accepts what the editor does produce, reformatting without complaint', async () => {
    const service = new EponymeService(html, createClient().client)
    await service.syncAll()

    const saved = await service.patch('page', { body: '<p>Hello<br>world</p>' }, 'publish')

    // `<br>` read back as `<br />` is the serializer, not a removal, so it must not be a 422.
    expect(saved).toMatchObject({ data: { body: '<p>Hello<br />world</p>' } })
  })

  it('rejects a collection entry created with active content', async () => {
    const service = new EponymeService(html, createClient().client)

    await expect(service.createCollectionEntry('posts', { title: 'One', body: '<a href="javascript:alert(1)">x</a>' }))
      .resolves.toEqual({ errors: { body: [expect.stringContaining('not allowed')] } })
  })

  it('sanitises an import instead of trusting the file it came from', async () => {
    const source = new EponymeService(html, createClient().client)
    await source.syncAll()
    await source.patch('page', { body: '<p>ok</p>' }, 'publish')
    const file = await source.exportContent()
    // The file is portable, so it is exactly as trustworthy as wherever it has been.
    const page = file.entries.find(entry => entry.name === 'page')!
    page.draft = { body: '<p>ok</p><script>alert(1)</script>', intro: { lead: '<p onmouseover="x()">lead</p>' } }
    page.published = { body: '<iframe src="https://evil.example"></iframe><p>after</p>', intro: { lead: '' } }

    const { client, rows } = createClient()
    const target = new EponymeService(html, client)
    await target.syncAll()
    const result = await target.importContent(file)

    expect(result).toMatchObject({ skipped: [] })
    expect(rows.get('page')).toMatchObject({
      draft: { body: '<p>ok</p>', intro: { lead: '<p>lead</p>' } },
      published: { body: '<p>after</p>' },
    })
  })

  it('sanitises a restore, so a version written before the policy cannot bring markup back', async () => {
    const { client, rows, versions } = createClient()
    const service = new EponymeService(html, client)
    await service.syncAll()
    await service.patch('page', { body: '<p>clean</p>' }, 'draft')
    // A history row from before sanitisation existed.
    versions.push({
      id: 999,
      entryName: 'page',
      data: { __eponyme: { version: 1, draft: { body: '<p>old<script>alert(1)</script></p>' }, published: {}, status: 'draft', publishedAt: null } },
      action: 'draft',
      status: 'draft',
      createdAt: new Date(),
    })

    await service.restore('page', 999)

    expect(rows.get('page')).toMatchObject({ draft: { body: '<p>old</p>' } })
  })

  it('cleans rich text nested in an array of items', async () => {
    const service = new EponymeService(html, createClient().client)

    await expect(service.createCollectionEntry('posts', {
      title: 'One',
      blocks: [{ text: '<p>a</p>' }, { text: '<p style="color:red">b</p>' }],
    })).resolves.toEqual({ errors: { 'blocks.1.text': [expect.stringContaining('not allowed')] } })
  })
})
