import { describe, expect, it, vi } from 'vitest'
import { defineEponymeConfig } from '../src/config/config'
import { collection } from '../src/config/collection'
import { field } from '../src/runtime/fields'
import { today } from '../src/runtime/fields/date'
import { EponymeService, type PrismaEponymeClient } from '../src/runtime/server/services/eponyme-store'
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
  let clock = 0
  const touch = (name: string) => {
    const stamp = new Date(++clock)
    stamps.set(name, stamp)
    return stamp
  }
  const write = (name: string, data: Record<string, unknown>) => {
    rows.set(name, data)
    return { name, data, updatedAt: touch(name) }
  }
  if (Object.keys(initial).length) write('homepage', initial)
  const client: PrismaEponymeClient = {
    eponyme: {
      async upsert({ where, create, update }) {
        const existing = rows.get(where.name)
        if (existing && !update.data) return { name: where.name, data: existing, updatedAt: stamps.get(where.name) }
        return write(where.name, update.data ?? existing ?? create.data)
      },
      async update({ where, data }) {
        return write(where.name, data.data)
      },
      async updateMany({ where, data }) {
        const stamp = stamps.get(where.name)
        if (!rows.has(where.name)) return { count: 0 }
        if (where.updatedAt && new Date(where.updatedAt).getTime() !== stamp?.getTime()) return { count: 0 }
        write(where.name, data.data)
        return { count: 1 }
      },
      async create({ data }) {
        if (rows.has(data.name)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
        return write(data.name, data.data)
      },
      async findUnique({ where }) {
        const data = rows.get(where.name)
        return data ? { name: where.name, data, updatedAt: stamps.get(where.name) } : null
      },
      async findMany({ where }) {
        return [...rows.entries()]
          .filter(([name]) => name.startsWith(where.name.startsWith))
          .map(([name, data]) => ({ name, data, updatedAt: stamps.get(name) }))
      },
      async delete({ where }) {
        const data = rows.get(where.name)
        if (!data) throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' })
        rows.delete(where.name)
        stamps.delete(where.name)
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
  return { client, rows, versions }
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
    await expect(service.listCollection('articles', 'draft')).resolves.toMatchObject([
      { slug: 'lete-a-paris', title: 'L’été à Paris', status: 'draft' },
    ])
    await expect(service.get('articles/lete-a-paris')).resolves.toBeUndefined()
    await expect(service.patch('articles/lete-a-paris', {}, 'publish')).resolves.toMatchObject({ status: 'published' })
    await expect(service.get('articles/lete-a-paris')).resolves.toMatchObject({ title: 'L’été à Paris' })
    await service.patch('articles/lete-a-paris', { title: 'Private rewrite' }, 'draft')
    await expect(service.listCollection('articles')).resolves.toMatchObject([
      { slug: 'lete-a-paris', title: 'L’été à Paris', data: { title: 'L’été à Paris' }, status: 'published' },
    ])
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
    expect(rows.has('articles/lete-a-paris')).toBe(false)
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
