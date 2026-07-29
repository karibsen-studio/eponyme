import { describe, expect, it, vi } from 'vitest'
import { defineEponymeConfig } from '../src/config/config'
import { collection } from '../src/config/collection'
import { field } from '../src/runtime/fields'
import { today } from '../src/runtime/fields/date'
import { EponymeService, schemaFingerprint, type EponymeExportFile, type PrismaEponymeClient } from '../src/runtime/server/services/eponyme-store'
import { createDefaultEponymeData } from '../src/runtime/utils/create-default-eponyme-data'
import { validateEponymeData } from '../src/runtime/utils/validate-eponyme-data'
import { normalizeSlug } from '../src/runtime/utils/normalize-slug'

function createClient(initial: Record<string, unknown> = {}) {
  const rows = new Map<string, Record<string, unknown>>()
  const versions: Array<{ id: number, entryName: string, data: unknown, action: string, status: string, createdAt: Date, userId?: string | null }> = []
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
    data: rows.get(name)!,
    updatedAt: stamps.get(name),
    deletedAt: deletions.get(name) ?? null,
  })
  const write = (name: string, data: Record<string, unknown>) => {
    rows.set(name, data)
    touch(name)
    return read(name)
  }
  const matchesDeleted = (name: string, filter: null | { not: null } | undefined) => {
    if (filter === undefined) return true
    return filter === null ? !deletions.has(name) : deletions.has(name)
  }
  if (Object.keys(initial).length) write('homepage', initial)
  const client: PrismaEponymeClient = {
    eponyme: {
      async upsert({ where, create, update }) {
        const existing = rows.get(where.name)
        if (existing && !update.data) return read(where.name)
        return write(where.name, update.data ?? existing ?? create.data)
      },
      async update({ where, data }) {
        return write(where.name, data.data)
      },
      async updateMany({ where, data }) {
        const stamp = stamps.get(where.name)
        if (!rows.has(where.name)) return { count: 0 }
        if (where.updatedAt && new Date(where.updatedAt).getTime() !== stamp?.getTime()) return { count: 0 }
        if (!matchesDeleted(where.name, where.deletedAt)) return { count: 0 }
        if (data.deletedAt === null) deletions.delete(where.name)
        else if (data.deletedAt) deletions.set(where.name, data.deletedAt)
        write(where.name, data.data ?? rows.get(where.name)!)
        return { count: 1 }
      },
      async create({ data }) {
        if (rows.has(data.name)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
        return write(data.name, data.data)
      },
      async findUnique({ where }) {
        return rows.has(where.name) ? read(where.name) : null
      },
      async findMany({ where }) {
        return [...rows.keys()]
          .filter(name => name.startsWith(where.name.startsWith) && matchesDeleted(name, where.deletedAt))
          .map(name => read(name))
      },
      async delete({ where }) {
        const data = rows.get(where.name)
        if (!data) throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' })
        rows.delete(where.name)
        stamps.delete(where.name)
        deletions.delete(where.name)
        // Mirrors `onDelete: Cascade` on EponymeVersion.entryName.
        for (let index = versions.length - 1; index >= 0; index--)
          if (versions[index]!.entryName === where.name) versions.splice(index, 1)
        return { name: where.name, data }
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
  }
  return { client, rows, versions, deletions }
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

describe('EponymeService', () => {
  it('synchronizes config changes, patches and resets one JSONB row', async () => {
    const { client, rows } = createClient({ title: 'Stored', tags: 'old format', removed: 'discard me' })
    const service = new EponymeService(config, client)

    await service.syncAll()
    expect(rows.get('homepage')).toEqual({
      __eponyme: {
        version: 1,
        draft: { title: 'Stored', enabled: true, tags: ['nuxt'] },
        published: { title: 'Stored', enabled: true, tags: ['nuxt'] },
        status: 'published',
        publishedAt: null,
      },
    })
    await expect(service.patch('homepage', { title: 'Changed' })).resolves.toMatchObject({
      data: { title: 'Changed', enabled: true, tags: ['nuxt'] },
      status: 'published',
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
    // The winner's content is what remains stored — never a silent mix of both.
    const stored = await service.get('homepage', 'draft')
    expect(['From tab A', 'From tab B']).toContain(stored!.title)
  })

  it('does not rewrite equivalent JSONB when object keys are returned in a different order', async () => {
    const { client } = createClient({
      __eponyme: {
        publishedAt: null,
        status: 'published',
        published: { tags: ['nuxt'], enabled: true, title: 'Welcome' },
        draft: { tags: ['nuxt'], enabled: true, title: 'Welcome' },
        version: 1,
      },
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

  it('keeps drafts private until they are published', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)

    await expect(service.patch('homepage', { title: '' }, 'draft')).resolves.toMatchObject({
      data: { title: '', enabled: true, tags: ['nuxt'] },
      status: 'draft',
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

  it('migrates the pre-release storage envelope without losing content', async () => {
    const { client, rows } = createClient({
      __keditor: {
        version: 1,
        draft: { title: 'Draft title', enabled: false, tags: ['draft'] },
        published: { title: 'Published title', enabled: true, tags: ['live'] },
        status: 'draft',
        publishedAt: null,
      },
    })
    const service = new EponymeService(config, client)

    await expect(service.get('homepage', 'draft')).resolves.toMatchObject({ title: 'Draft title' })
    expect(rows.get('homepage')).toMatchObject({
      __eponyme: {
        draft: { title: 'Draft title' },
        published: { title: 'Published title' },
      },
    })
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
      status: 'draft',
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

    // Sorting on a schema field, not just on the entry metadata.
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
    const findMany = vi.spyOn(client.eponyme, 'findMany')
    const sitemap = await service.getSitemapEntries({
      homepage: '/',
      articles: '/articles/:slug',
    })
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(sitemap).toEqual([
      { loc: '/' },
      { loc: '/articles/lete-a-paris', lastmod: expect.any(String) },
    ])
    await expect(service.get('articles/does-not-exist', 'draft')).resolves.toBeUndefined()
    expect(rows.has('articles/does-not-exist')).toBe(false)
    await expect(service.deleteCollectionEntry('articles/lete-a-paris')).resolves.toBe(true)
    // The row survives: deleting only moves the entry to the trash.
    expect(rows.has('articles/lete-a-paris')).toBe(true)
  })

  it('trashes, restores and purges a collection entry', async () => {
    const { client, rows, versions } = createClient()
    const service = new EponymeService(config, client)

    await service.createCollectionEntry('articles', { title: 'L’été à Paris' })
    await service.patch('articles/lete-a-paris', {}, 'publish')
    expect(versions.filter(version => version.entryName === 'articles/lete-a-paris')).toHaveLength(2)

    await expect(service.deleteCollectionEntry('articles/lete-a-paris')).resolves.toBe(true)
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
    await expect(service.deleteCollectionEntry('articles/lete-a-paris')).resolves.toBe(false)
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
    // History survived the round trip.
    await expect(service.history('articles/lete-a-paris')).resolves.toHaveLength(2)
    await expect(service.purgeCollectionEntry('articles/lete-a-paris')).resolves.toBe(false)

    await service.deleteCollectionEntry('articles/lete-a-paris')
    await expect(service.purgeCollectionEntry('articles/lete-a-paris')).resolves.toBe(true)
    expect(rows.has('articles/lete-a-paris')).toBe(false)
    expect(versions.filter(version => version.entryName === 'articles/lete-a-paris')).toHaveLength(0)
    // The slug is free again.
    await expect(service.createCollectionEntry('articles', { title: 'Retake', slug: 'lete-a-paris' })).resolves.toMatchObject({ slug: 'lete-a-paris' })
  })

  it('refuses to trash anything that is not a collection entry', async () => {
    const { client } = createClient({ title: 'Welcome' })
    const service = new EponymeService(config, client)

    await expect(service.deleteCollectionEntry('homepage')).resolves.toBe(false)
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

  it('ignores relabelled fields, since only the shape of a schema matters', () => {
    const before = { title: field.string({ label: 'Title', required: true }) }
    const after = { title: field.string({ label: 'Headline', placeholder: 'Type here' }) }
    expect(schemaFingerprint(after)).toBe(schemaFingerprint(before))
    expect(schemaFingerprint({ title: field.textarea() })).not.toBe(schemaFingerprint(before))
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

  it('rejects a file that is not an Eponyme export', async () => {
    const { client } = createClient()
    const service = new EponymeService(config, client)

    await expect(service.importContent({ entries: [] })).resolves.toMatchObject({ errors: [expect.any(String)] })
    await expect(service.importContent(null)).resolves.toMatchObject({ errors: [expect.any(String)] })
    const malformed = { eponyme: { format: 1, exportedAt: '', schemas: {} }, entries: [{ name: 'homepage' }] } as unknown as EponymeExportFile
    await expect(service.importContent(malformed)).resolves.toMatchObject({ errors: [expect.any(String)] })
  })
})
