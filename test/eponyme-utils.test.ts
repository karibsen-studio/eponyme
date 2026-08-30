import { beforeAll, describe, expect, it } from 'vitest'
import { humanizeLabel } from '../src/runtime/utils/humanize-label'
import { asRecord } from '../src/runtime/utils/as-record'
import { childErrors, errorsAt, fieldPathId, hasErrorsUnder, joinFieldPath } from '../src/runtime/utils/field-path'
import { normalizeHexColor, sameHexColor } from '../src/runtime/utils/normalize-hex-color'
import { collection } from '../src/config/collection'
import { form } from '../src/config/form'
import { field } from '../src/runtime/fields'
import { resolveEponymeSeo } from '../src/runtime/fields/seo'
import { isFieldVisible } from '../src/runtime/utils/is-field-visible'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas, isEponymeForm, isEponymeSchema } from '../src/runtime/utils/get-eponyme-schemas'
import { findEponymeVariableRanges, interpolateEponymeText, interpolateEponymeValue, resolveEponymeVariables, summariseEponymeVariables } from '../src/runtime/utils/variables'
import { applyPreviewSlug, readPreviewQuery, readPreviewVersion, resolvePreviewPath } from '../src/runtime/utils/preview'
import { buildEponymeNavigationTree } from '../src/runtime/utils/build-navigation-tree'
import { filterEponymeNavigationTree, preloadEponymeNavigationSearch } from '../src/runtime/utils/filter-navigation-tree'
import { cacheDuringHydrationOnly, cacheForPublicRead } from '../src/runtime/utils/hydration-cache'
import { getEponymeCacheTags, tagPreviewPathRoutes } from '../src/runtime/utils/cache-tags'
import { normalizeEponymePhone, toEponymePhoneValue } from '../src/runtime/utils/normalize-phone'
import { normalizeEponymeTags } from '../src/runtime/utils/normalize-tags'
import { eponymeMediaEmbedUrl, parseEponymeMediaUrl } from '../src/runtime/utils/media-player'
import { normalizeEponymeValues } from '../src/runtime/utils/normalize-eponyme-values'
import { validateEponymeData } from '../src/runtime/utils/validate-eponyme-data'
import { middleEllipsis } from '../src/runtime/utils/middle-ellipsis'
import { resolveLoginRedirect } from '../src/runtime/utils/login-redirect'

describe('middleEllipsis', () => {
  it('keeps short text unchanged', () => {
    expect(middleEllipsis('https://eponyme.dev')).toBe('https://eponyme.dev')
  })

  it('preserves both ends within the requested length', () => {
    expect(middleEllipsis('https://eponyme.dev/documentation', 20)).toBe('https://ep…mentation')
  })

  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect(middleEllipsis('ab🔥cdef', 6)).toBe('ab🔥…ef')
  })
})

describe('humanizeLabel', () => {
  it('turns a field name into a title', () => {
    expect(humanizeLabel('launch_date')).toBe('Launch Date')
    expect(humanizeLabel('hero-title')).toBe('Hero Title')
    expect(humanizeLabel('title')).toBe('Title')
  })

  it('splits camel case', () => {
    expect(humanizeLabel('productionPhoto')).toBe('Production Photo')
    expect(humanizeLabel('production_photoGallery')).toBe('Production Photo Gallery')
    expect(humanizeLabel('heroSEOTitle')).toBe('Hero SEO Title')
    expect(humanizeLabel('SEO')).toBe('SEO')
  })

  it('prefers the configured label', () => {
    expect(humanizeLabel('seo', 'SEO settings')).toBe('SEO settings')
  })
})

describe('asRecord', () => {
  it('only accepts plain objects', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord(['a'])).toEqual({})
    expect(asRecord(null)).toEqual({})
    expect(asRecord('nope')).toEqual({})
  })
})

describe('normalizeHexColor', () => {
  it('expands and lowercases hex colours', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
    expect(normalizeHexColor('#171714')).toBe('#171714')
    expect(normalizeHexColor('#FFFFFF')).toBe('#ffffff')
    expect(normalizeHexColor('  #Fff  ')).toBe('#ffffff')
  })

  it('keeps the alpha channel', () => {
    expect(normalizeHexColor('#AABBCCDD')).toBe('#aabbccdd')
  })

  it('reads back the rgb() notation a browser writes into the DOM', () => {
    expect(normalizeHexColor('rgb(180, 101, 74)')).toBe('#b4654a')
    expect(normalizeHexColor('RGB(0,0,0)')).toBe('#000000')
    expect(sameHexColor('rgb(255, 255, 255)', '#FFF')).toBe(true)
  })

  it('rejects anything that is not a hex colour', () => {
    expect(normalizeHexColor('red')).toBeUndefined()
    expect(normalizeHexColor('rgb(300, 0, 0)')).toBeUndefined()
    expect(normalizeHexColor('rgba(0, 0, 0, 0.5)')).toBeUndefined()
    expect(normalizeHexColor('#12345')).toBeUndefined()
    expect(normalizeHexColor('171714')).toBeUndefined()
    expect(normalizeHexColor(undefined)).toBeUndefined()
    expect(normalizeHexColor(42)).toBeUndefined()
  })

  it('compares colours across notations', () => {
    expect(sameHexColor('#FFF', '#ffffff')).toBe(true)
    expect(sameHexColor('#fff', '#000')).toBe(false)
    // Two invalid values are not "the same colour".
    expect(sameHexColor('nope', 'nope')).toBe(false)
  })
})

describe('field paths', () => {
  const errors = {
    'title': ['Root message.'],
    'hero.title': ['Nested message.'],
    'items.0.title': ['Item message.'],
  }

  it('builds paths and dom ids', () => {
    expect(joinFieldPath('hero', 'title')).toBe('hero.title')
    expect(joinFieldPath('', 'hero')).toBe('hero')
    expect(joinFieldPath('items', 0)).toBe('items.0')
    expect(fieldPathId('items.0.title')).toBe('field-items-0-title')
  })

  it('reads the messages of one exact path', () => {
    expect(errorsAt(errors, 'title')).toEqual(['Root message.'])
    expect(errorsAt(errors, 'hero')).toEqual([])
    expect(errorsAt(undefined, 'title')).toEqual([])
  })

  it('re-keys nested errors relative to a container', () => {
    expect(childErrors(errors, 'hero')).toEqual({ title: ['Nested message.'] })
    expect(childErrors(errors, 'items')).toEqual({ '0.title': ['Item message.'] })
    expect(childErrors(errors, 'missing')).toEqual({})
  })

  it('detects errors anywhere under a path', () => {
    expect(hasErrorsUnder(errors, 'hero')).toBe(true)
    expect(hasErrorsUnder(errors, 'title')).toBe(true)
    expect(hasErrorsUnder(errors, 'seo')).toBe(false)
  })
})

describe('resolvePreviewPath', () => {
  const previewPaths = {
    'pages/homepage': '/',
    'articles': '/articles/:slug',
    'legacy': '/legacy',
  }
  const collections = ['articles', 'legacy']

  it('returns the configured path of a singleton', () => {
    expect(resolvePreviewPath(previewPaths, collections, 'pages/homepage')).toBe('/')
  })

  it('fills :slug from a collection entry name', () => {
    expect(resolvePreviewPath(previewPaths, collections, 'articles/my-article')).toBe('/articles/my-article')
  })

  it('encodes the slug', () => {
    expect(resolvePreviewPath(previewPaths, collections, 'articles/été & co')).toBe('/articles/%C3%A9t%C3%A9%20%26%20co')
  })

  it('ignores nested slugs, unknown entries and patterns without :slug', () => {
    expect(resolvePreviewPath(previewPaths, collections, 'articles/a/b')).toBeUndefined()
    expect(resolvePreviewPath(previewPaths, collections, 'articles')).toBe('/articles/:slug')
    expect(resolvePreviewPath(previewPaths, collections, 'pages/unknown')).toBeUndefined()
    expect(resolvePreviewPath(previewPaths, collections, 'legacy/entry')).toBeUndefined()
  })

  it('replaces every :slug occurrence', () => {
    expect(applyPreviewSlug('/:slug/read/:slug', 'post')).toBe('/post/read/post')
  })
})

describe('readPreviewVersion', () => {
  it('maps the query value to a version selector', () => {
    expect(readPreviewVersion('published')).toBe('published')
    expect(readPreviewVersion('draft')).toBe('draft')
    expect(readPreviewVersion('12')).toBe(12)
    expect(readPreviewVersion('0')).toBe('draft')
    expect(readPreviewVersion('nope')).toBe('draft')
    expect(readPreviewVersion(undefined)).toBe('draft')
  })
})

describe('readPreviewQuery', () => {
  it('unwraps the repeated-param array form', () => {
    expect(readPreviewQuery({ __eponyme_preview: ['articles/a', 'b'], __eponyme_preview_version: ['7'] }))
      .toEqual({ entry: 'articles/a', version: '7' })
    expect(readPreviewQuery({})).toEqual({ entry: undefined, version: undefined })
  })
})

describe('form()', () => {
  it('defaults to the custom mode so nothing is stored implicitly', () => {
    const contact = form({ fields: { email: field.email({ required: true }) } })
    expect(contact.__eponymeForm).toBe(true)
    expect(contact.submission.mode).toBe('custom')
    expect(contact.submission.maxStored).toBe(10_000)
    expect(contact.submission.retentionDays).toBe(365)
    expect(contact.honeypot).toBe('_eponyme_hp')
    expect(contact.maxBodyBytes).toBe(64 * 1024)
  })

  it('keeps an explicit managed mode and overrides', () => {
    const contact = form({
      fields: { email: field.email() },
      submission: { mode: 'managed', maxStored: 50, retentionDays: false },
      honeypot: false,
      maxBodyBytes: 1024,
    })
    expect(contact.submission.mode).toBe('managed')
    expect(contact.submission.maxStored).toBe(50)
    expect(contact.submission.retentionDays).toBe(false)
    expect(contact.honeypot).toBe(false)
    expect(contact.maxBodyBytes).toBe(1024)
  })

  it('accepts every field type a visitor can fill in', () => {
    expect(() => form({
      fields: {
        name: field.string(),
        message: field.textarea(),
        email: field.email(),
        website: field.url(),
        guests: field.number(),
        agree: field.boolean(),
        topic: field.select({ options: [{ label: 'A', value: 'a' }] }),
        plan: field.radio({ options: [{ label: 'A', value: 'a' }] }),
        tags: field.checkboxGroup({ options: [{ label: 'A', value: 'a' }] }),
      },
    })).not.toThrow()
  })

  // TypeScript already rejects these at the call site – the @ts-expect-error
  // directives are part of the assertion. The runtime guard is the second line of
  // defence, for JavaScript consumers and for values built dynamically.
  it('rejects authoring-only field types', () => {
    // @ts-expect-error richText is not a public form field
    expect(() => form({ fields: { body: field.richText() } })).toThrow(/field\.richText\(\)/)
    // @ts-expect-error slug is not a public form field
    expect(() => form({ fields: { slug: field.slug() } })).toThrow(/not available in a public form/)
    // @ts-expect-error image is not a public form field
    expect(() => form({ fields: { cover: field.image() } })).toThrow(/field\.image\(\)/)
    // @ts-expect-error date is not a public form field
    expect(() => form({ fields: { day: field.date() } })).toThrow(/field\.date\(\)/)
    // @ts-expect-error datetime is not a public form field
    expect(() => form({ fields: { startsAt: field.datetime() } })).toThrow(/field\.datetime\(\)/)
    // @ts-expect-error duration is not a public form field
    expect(() => form({ fields: { runtime: field.duration() } })).toThrow(/field\.duration\(\)/)
    // @ts-expect-error color is not a public form field
    expect(() => form({ fields: { tint: field.color() } })).toThrow(/field\.color\(\)/)
    // @ts-expect-error array is not a public form field
    expect(() => form({ fields: { items: field.array({ of: field.string() }) } })).toThrow(/field\.array\(\)/)
    // @ts-expect-error section is not a public form field
    expect(() => form({ fields: { meta: field.section({ fields: { a: field.string() } }) } })).toThrow(/field\.section\(\)/)
  })

  it('refuses a honeypot that shadows a declared field', () => {
    expect(() => form({ fields: { website: field.url() }, honeypot: 'website' })).toThrow(/collides with a declared field/)
  })

  it('refuses invalid submission retention limits', () => {
    expect(() => form({ fields: { email: field.email() }, submission: { maxStored: 0 } })).toThrow(/maxStored/)
    expect(() => form({ fields: { email: field.email() }, submission: { retentionDays: Number.NaN } })).toThrow(/retentionDays/)
  })
})

describe('form discovery', () => {
  const config = {
    pages: { homepage: { title: field.string() } },
    articles: collection({ titleField: 'title', slugField: 'slug', fields: { title: field.string(), slug: field.slug() } }),
    contact: form({ fields: { email: field.email() } }),
    marketing: { newsletter: form({ fields: { email: field.email() } }) },
  }

  it('flattens forms, including nested ones', () => {
    expect(Object.keys(getEponymeForms(config))).toEqual(['contact', 'marketing/newsletter'])
  })

  it('keeps forms out of schemas and collections', () => {
    expect(Object.keys(getEponymeSchemas(config))).toEqual(['pages/homepage'])
    expect(Object.keys(getEponymeCollections(config))).toEqual(['articles'])
  })

  it('never walks a form as if it were a folder', () => {
    expect(Object.keys(getEponymeSchemas(config))).not.toContain('contact/fields')
    expect(isEponymeSchema(config.contact)).toBe(false)
    expect(isEponymeForm(config.contact)).toBe(true)
    expect(isEponymeForm(config.articles)).toBe(false)
  })

  it('builds route-facing registries without an Object prototype', () => {
    for (const registry of [getEponymeSchemas(config), getEponymeCollections(config), getEponymeForms(config)]) {
      expect(Object.getPrototypeOf(registry)).toBeNull()
      expect(registry.constructor).toBeUndefined()
      expect(registry.toString).toBeUndefined()
      expect(registry.__proto__).toBeUndefined()
    }
  })
})

describe('content variables', () => {
  const at = new Date('2026-07-29T10:00:00Z')

  it('resolves the built-in date variables', () => {
    const resolved = resolveEponymeVariables({}, at)
    expect(resolved.currentYear).toBe('2026')
    expect(resolved.nextYear).toBe('2027')
    expect(resolved.previousYear).toBe('2025')
    expect(resolved.currentDate).toBe('2026-07-29')
  })

  it('lets the host application add and override variables', () => {
    const resolved = resolveEponymeVariables({
      clubName: 'AS Chelles',
      season: { label: 'Season', value: () => '2026-2027' },
      currentYear: 'overridden',
    }, at)
    expect(resolved.clubName).toBe('AS Chelles')
    expect(resolved.season).toBe('2026-2027')
    expect(resolved.currentYear).toBe('overridden')
  })

  it('survives a variable that throws', () => {
    const broken = () => {
      throw new Error('nope')
    }
    const resolved = resolveEponymeVariables({ broken }, at)
    expect(resolved.broken).toBe('')
    // A single broken variable must not take the rest of the page with it.
    expect(resolved.currentYear).toBe('2026')
  })

  it('replaces variables in text and tolerates spacing', () => {
    const vars = resolveEponymeVariables({}, at)
    expect(interpolateEponymeText('saison {{ nextYear }}', vars)).toBe('saison 2027')
    expect(interpolateEponymeText('{{currentYear}} et {{  currentYear  }}', vars)).toBe('2026 et 2026')
  })

  it('finds the source ranges rendered as variables in the rich-text editor', () => {
    const text = 'Saison {{ currentYear }} / {{nextYear}}.'
    expect(findEponymeVariableRanges(text).map(range => text.slice(range.from, range.to))).toEqual([
      '{{ currentYear }}',
      '{{nextYear}}',
    ])
    expect(findEponymeVariableRanges('{{ new Date() }}')).toEqual([])
  })

  it('leaves an unknown name in place instead of blanking it', () => {
    // A typo has to be visible on the page rather than silently deleting text.
    expect(interpolateEponymeText('a {{ nope }} b', resolveEponymeVariables({}, at))).toBe('a {{ nope }} b')
  })

  it('never evaluates an expression', () => {
    const vars = resolveEponymeVariables({}, at)
    const dangerous = '{{ new Date().getFullYear() }} {{ process.exit(1) }}'
    expect(interpolateEponymeText(dangerous, vars)).toBe(dangerous)
  })

  it('walks nested objects and arrays', () => {
    const vars = resolveEponymeVariables({}, at)
    expect(interpolateEponymeValue({
      title: 'Saison {{ nextYear }}',
      count: 3,
      enabled: true,
      items: [{ body: '<p>{{ currentYear }}</p>' }],
    }, vars)).toEqual({
      title: 'Saison 2027',
      count: 3,
      enabled: true,
      items: [{ body: '<p>2026</p>' }],
    })
  })

  it('summarises variables for the editor menu', () => {
    const summary = summariseEponymeVariables({ clubName: { label: 'Club', value: 'AS Chelles' } })
    expect(summary.find(entry => entry.name === 'clubName')).toMatchObject({ label: 'Club', preview: 'AS Chelles' })
    expect(summary.find(entry => entry.name === 'currentYear')?.label).toBe('Current year')
  })
})

describe('navigation tree', () => {
  const config = {
    'pages/homepage': { title: field.string() },
    'pages/legal/terms': { title: field.string() },
    'articles': collection({
      label: 'Articles',
      titleField: 'title',
      slugField: 'slug',
      fields: { title: field.string({ required: true }), slug: field.slug({ required: true }) },
    }),
    'contact': form({ label: 'Contact form', fields: { email: field.email() } }),
  }
  const tree = () => buildEponymeNavigationTree({
    schemas: getEponymeSchemas(config),
    collections: getEponymeCollections(config),
    forms: getEponymeForms(config),
    collectionEntries: {
      articles: [
        { slug: 'lete-a-paris', title: 'L’été à Paris' },
        { slug: 'nuxt-modules', title: 'Nuxt modules' },
      ],
    },
  })

  it('nests entries under the folders their names imply', () => {
    const root = tree()
    expect(root.map(node => `${node.kind}:${node.path}`)).toEqual([
      'folder:pages',
      'collection:articles',
      'form:contact',
    ])

    const pages = root.find(node => node.path === 'pages')!
    expect(pages.label).toBe('Pages')
    expect(pages.children.map(node => `${node.kind}:${node.path}`)).toEqual(['entry:pages/homepage', 'folder:pages/legal'])
    // A folder nobody declared still gets a humanized label.
    expect(pages.children[1]!.children).toMatchObject([{ kind: 'entry', path: 'pages/legal/terms', label: 'Terms' }])
  })

  it('adds loaded collection entries as leaves, labelled with their title', () => {
    const articles = tree().find(node => node.path === 'articles')!
    expect(articles.label).toBe('Articles')
    expect(articles.children).toMatchObject([
      { kind: 'entry', path: 'articles/lete-a-paris', label: 'L’été à Paris' },
      { kind: 'entry', path: 'articles/nuxt-modules', label: 'Nuxt modules' },
    ])
  })
})

describe('filterEponymeNavigationTree', () => {
  // Fuse is fetched on demand, so the fuzzy assertions below need it resolved first. Without
  // this the filter answers by substring, which is deliberate but not what they check.
  beforeAll(async () => {
    await preloadEponymeNavigationSearch()
  })

  const tree = () => buildEponymeNavigationTree({
    schemas: { 'pages/homepage': {}, 'pages/legal/terms': {} },
    collections: { articles: { label: 'Articles' } },
    forms: { contact: { label: 'Contact form' } },
    collectionEntries: {
      articles: [
        { slug: 'lete-a-paris', title: 'L’été à Paris' },
        { slug: 'nuxt-modules', title: 'Nuxt modules' },
      ],
    },
  })
  const paths = (nodes: ReturnType<typeof tree>): string[] =>
    nodes.flatMap(node => [node.path, ...paths(node.children)])

  it('returns the tree untouched for an empty query', () => {
    const root = tree()
    expect(filterEponymeNavigationTree(root, '   ')).toBe(root)
  })

  it('keeps a match along with the folders leading to it', () => {
    expect(paths(filterEponymeNavigationTree(tree(), 'terms'))).toEqual(['pages', 'pages/legal', 'pages/legal/terms'])
  })

  it('ignores case and accents', () => {
    expect(paths(filterEponymeNavigationTree(tree(), 'ETE a paris'))).toEqual(['articles', 'articles/lete-a-paris'])
  })

  it('tolerates a typo', () => {
    expect(paths(filterEponymeNavigationTree(tree(), 'homepag'))).toContain('pages/homepage')
    expect(paths(filterEponymeNavigationTree(tree(), 'contakt'))).toContain('contact')
  })

  it('matches on the path as well as the label', () => {
    expect(paths(filterEponymeNavigationTree(tree(), 'nuxt-modules'))).toContain('articles/nuxt-modules')
  })

  it('keeps every child of a node matched on its own label', () => {
    expect(paths(filterEponymeNavigationTree(tree(), 'articles'))).toEqual([
      'articles',
      'articles/lete-a-paris',
      'articles/nuxt-modules',
    ])
  })

  it('returns nothing when the query matches nothing', () => {
    expect(filterEponymeNavigationTree(tree(), 'zzzzzzzz')).toEqual([])
  })
})

describe('getEponymeCacheTags', () => {
  it('tags a singleton with itself and the global tag', () => {
    expect(getEponymeCacheTags('pages/homepage')).toEqual(['eponyme', 'eponyme:pages/homepage'])
  })

  it('adds the collection tag so publishing an entry can drop its index', () => {
    expect(getEponymeCacheTags('articles/my-article', 'articles')).toEqual([
      'eponyme',
      'eponyme:articles/my-article',
      'eponyme:articles',
    ])
    expect(getEponymeCacheTags('articles/my-article', { name: 'articles' })).toContain('eponyme:articles')
  })

  it('strips commas, which would silently split one tag into two', () => {
    expect(getEponymeCacheTags('pages/a,b')).toEqual(['eponyme', 'eponyme:pages/ab'])
  })
})

describe('tagPreviewPathRoutes', () => {
  it('tags a singleton route exactly and a collection route by collection', () => {
    const rules: Record<string, { headers?: Record<string, string> }> = {}
    tagPreviewPathRoutes({ 'pages/homepage': '/', 'articles': '/articles/:slug' }, rules)
    expect(rules['/']!.headers).toEqual({
      'Vercel-Cache-Tag': 'eponyme,eponyme:pages/homepage',
      'Cache-Tag': 'eponyme,eponyme:pages/homepage',
    })
    // `:slug` becomes a glob, because that is what routeRules match on.
    expect(rules['/articles/**']!.headers).toMatchObject({ 'Cache-Tag': 'eponyme,eponyme:articles' })
  })

  it('keeps the rules the application already wrote', () => {
    const rules: Record<string, { headers?: Record<string, string>, isr?: number }> = {
      '/articles/**': { isr: 300, headers: { 'Cache-Tag': 'mine' } },
    }
    tagPreviewPathRoutes({ articles: '/articles/:slug' }, rules)
    // The caching rule survives, and a tag the host chose is not overwritten.
    expect(rules['/articles/**']).toMatchObject({ isr: 300, headers: { 'Cache-Tag': 'mine' } })
    // The Vercel header nobody set is still filled in.
    expect(rules['/articles/**']!.headers!['Vercel-Cache-Tag']).toBe('eponyme,eponyme:articles')
  })

  it('ignores a preview path that is not a route', () => {
    const rules: Record<string, { headers?: Record<string, string> }> = {}
    expect(tagPreviewPathRoutes({ articles: 'https://example.com/:slug' }, rules)).toEqual([])
    expect(rules).toEqual({})
  })

  it('reports what it wrote, so the module can announce it', () => {
    expect(tagPreviewPathRoutes({ 'pages/homepage': '/', 'articles': '/articles/:slug' }, {})).toEqual([
      { route: '/', tag: 'eponyme:pages/homepage' },
      // The glob cannot name a slug, so the collection tag is the one it will carry.
      { route: '/articles/**', tag: 'eponyme:articles' },
    ])
  })
})

describe('hydration cache', () => {
  type FakeNuxtApp = Parameters<typeof cacheDuringHydrationOnly>[1]
  const nuxtApp = (isHydrating: boolean, data: Record<string, unknown> = {}) =>
    ({ isHydrating, payload: { data } }) as unknown as FakeNuxtApp

  it('leaves published content to Nuxt, which may reuse a prerendered payload', () => {
    expect(cacheForPublicRead(true)).toBeUndefined()
  })

  it('keeps unreleased content on the hydration-only policy', () => {
    expect(cacheForPublicRead(false)).toBe(cacheDuringHydrationOnly)
  })

  it('serves the payload while hydrating and nothing afterwards', () => {
    const key = 'eponyme:homepage:draft'
    expect(cacheDuringHydrationOnly(key, nuxtApp(true, { [key]: { data: { title: 'Draft' } } }))).toEqual({ data: { title: 'Draft' } })
    expect(cacheDuringHydrationOnly(key, nuxtApp(false, { [key]: { data: { title: 'Draft' } } }))).toBeUndefined()
  })
})

describe('field.phone()', () => {
  const validate = (options: Parameters<typeof field.phone>[0], value: unknown) =>
    validateEponymeData({ phone: field.phone(options) }, { phone: value }, 'publish').phone

  it('normalises an international number to E.164', () => {
    expect(normalizeEponymePhone('+33 6 11 13 11 43')).toMatchObject({ valid: true, e164: '+33611131143', country: 'FR' })
    expect(toEponymePhoneValue(' +1 (415) 555-2671 ')).toBe('+14155552671')
  })

  it('resolves a national number against defaultCountry', () => {
    expect(toEponymePhoneValue('06 11 13 11 43', { defaultCountry: 'FR' })).toBe('+33611131143')
    // Without a default country there is nothing to resolve it against.
    expect(validate({}, '06 11 13 11 43')).toEqual(['Must be a valid phone number.'])
  })

  it('requires the international form when detectCountry is false', () => {
    expect(validate({ detectCountry: false, defaultCountry: 'FR' }, '0611131143'))
      .toEqual(['Must be a valid phone number in international format, starting with the country code.'])
    expect(validate({ detectCountry: false }, '+33611131143')).toBeUndefined()
  })

  it('refuses a number from a country that is not accepted', () => {
    expect(validate({ countries: ['FR', 'BE'] }, '+14155552671'))
      .toEqual(['Numbers from US are not accepted. Use a number from: FR, BE.'])
    expect(validate({ countries: ['FR', 'BE'] }, '+33611131143')).toBeUndefined()
  })

  it('reports an unparsable number and leaves the value untouched', () => {
    expect(validate({}, 'bonjour')).toEqual(['Must be a valid phone number.'])
    expect(toEponymePhoneValue('bonjour')).toBe('bonjour')
  })

  it('treats an empty value as absent, leaving `required` to decide', () => {
    expect(validate({}, '')).toBeUndefined()
    expect(validate({ required: true }, '')).toEqual(['This field is required.'])
  })

  it('normalises phones nested in sections, tabs and arrays', () => {
    const schema = {
      contact: field.section({ fields: { phone: field.phone({ defaultCountry: 'FR' }) } }),
      people: field.array({ of: { phone: field.phone({ defaultCountry: 'FR' }) } }),
      meta: field.tab({ tabs: { main: { label: 'Main', fields: { phone: field.phone({ defaultCountry: 'FR' }) } } } }),
    }
    expect(normalizeEponymeValues(schema, {
      contact: { phone: '0611131143' },
      people: [{ phone: '0611131143' }],
      meta: { main: { phone: '0611131143' } },
    })).toEqual({
      contact: { phone: '+33611131143' },
      people: [{ phone: '+33611131143' }],
      meta: { main: { phone: '+33611131143' } },
    })
  })

  it('is available in a public form', () => {
    expect(() => form({ fields: { phone: field.phone() } })).not.toThrow()
  })
})

describe('field.tags()', () => {
  it('trims, drops blanks and folds duplicate spellings', () => {
    expect(normalizeEponymeTags(['Nuxt', ' nuxt ', '', '  ', 'Vue'])).toEqual(['Nuxt', 'Vue'])
    expect(normalizeEponymeTags('not an array')).toEqual([])
    expect(normalizeEponymeTags([42, 'Vue', null])).toEqual(['Vue'])
  })

  it('lets a suggestion impose its spelling', () => {
    const options = { suggestions: ['Nuxt', 'TypeScript'] } as const
    expect(normalizeEponymeTags(['nuxt', 'typescript'], options)).toEqual(['Nuxt', 'TypeScript'])
    // A custom tag keeps the spelling it was given.
    expect(normalizeEponymeTags(['GraphQL'], options)).toEqual(['GraphQL'])
  })

  it('keeps the first spelling when nothing declares one', () => {
    expect(normalizeEponymeTags(['Vue', 'VUE', 'vue'])).toEqual(['Vue'])
  })

  it('normalises tags nested in sections, tabs and arrays', () => {
    const schema = {
      meta: field.section({ fields: { tags: field.tags({ suggestions: ['Nuxt'] }) } }),
      items: field.array({ of: { tags: field.tags({ suggestions: ['Nuxt'] }) } }),
      panels: field.tab({ tabs: { main: { label: 'Main', fields: { tags: field.tags({ suggestions: ['Nuxt'] }) } } } }),
    }
    expect(normalizeEponymeValues(schema, {
      meta: { tags: ['nuxt', 'nuxt'] },
      items: [{ tags: [' NUXT '] }],
      panels: { main: { tags: ['nuxt', 'Vue'] } },
    })).toEqual({
      meta: { tags: ['Nuxt'] },
      items: [{ tags: ['Nuxt'] }],
      panels: { main: { tags: ['Nuxt', 'Vue'] } },
    })
  })
})

describe('field.mediaPlayer()', () => {
  const validate = (options: Parameters<typeof field.mediaPlayer>[0], value: unknown) =>
    validateEponymeData({ video: field.mediaPlayer(options) }, { video: value }, 'publish').video

  it('reads a YouTube id out of every address that carries one', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123',
    ]) expect(parseEponymeMediaUrl(url)).toMatchObject({ provider: 'youtube', id: 'dQw4w9WgXcQ' })
  })

  it('reads a Vimeo id, including a channel path and a player address', () => {
    expect(parseEponymeMediaUrl('https://vimeo.com/76979871')).toMatchObject({ provider: 'vimeo', id: '76979871' })
    expect(parseEponymeMediaUrl('https://vimeo.com/channels/staffpicks/76979871')).toMatchObject({ provider: 'vimeo', id: '76979871' })
    expect(parseEponymeMediaUrl('https://player.vimeo.com/video/76979871')).toMatchObject({ provider: 'vimeo', id: '76979871' })
  })

  it('reads a VK Video id from a share, a feed and an embed address', () => {
    for (const url of [
      'https://vkvideo.ru/video-217986831_456240041',
      'https://vk.com/video-217986831_456240041',
      'https://vk.com/video?z=video-217986831_456240041%2Fpl_cat_updates',
      'https://vkvideo.ru/video_ext.php?oid=-217986831&id=456240041&hd=4',
    ]) expect(parseEponymeMediaUrl(url)).toMatchObject({ provider: 'vkvideo', id: '-217986831_456240041' })
    // A video owned by a person rather than a community carries a positive owner.
    expect(parseEponymeMediaUrl('https://vkvideo.ru/video123_456')).toMatchObject({ provider: 'vkvideo', id: '123_456' })
  })

  it('falls back to a direct file, which has no id', () => {
    expect(parseEponymeMediaUrl('https://cdn.example.com/reel.mp4')).toEqual({
      provider: 'url',
      url: 'https://cdn.example.com/reel.mp4',
      id: '',
    })
  })

  it('refuses a provider this field does not accept rather than treating it as a file', () => {
    const options = { providers: ['vimeo', 'url'] } as const
    expect(parseEponymeMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', options)).toMatchObject({ provider: '', id: '' })
    expect(validate({ providers: ['vimeo', 'url'] }, { provider: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: '' }))
      .toEqual(['Must be a Vimeo link or a direct video URL.'])
  })

  it('builds the embed address from the stored value', () => {
    expect(eponymeMediaEmbedUrl(parseEponymeMediaUrl('https://youtu.be/dQw4w9WgXcQ')))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(eponymeMediaEmbedUrl(parseEponymeMediaUrl('https://vimeo.com/76979871/abc123')))
      .toBe('https://player.vimeo.com/video/76979871?h=abc123')
    expect(eponymeMediaEmbedUrl(parseEponymeMediaUrl('https://vkvideo.ru/video-217986831_456240041')))
      .toBe('https://vkvideo.ru/video_ext.php?oid=-217986831&id=456240041&hd=4')
    // A direct file is played as it stands, and an empty value embeds nothing.
    expect(eponymeMediaEmbedUrl(parseEponymeMediaUrl('https://cdn.example.com/reel.mp4'))).toBe('https://cdn.example.com/reel.mp4')
    expect(eponymeMediaEmbedUrl({ provider: 'youtube', url: 'https://youtu.be/x', id: '' })).toBe('')
  })

  it('rereads the provider on write, so a payload cannot claim one the address contradicts', () => {
    const schema = {
      video: field.mediaPlayer(),
      section: field.section({ fields: { video: field.mediaPlayer() } }),
      items: field.array({ of: { video: field.mediaPlayer() } }),
    }
    expect(normalizeEponymeValues(schema, {
      video: { provider: 'vimeo', url: 'https://youtu.be/dQw4w9WgXcQ', id: '999' },
      section: { video: { provider: '', url: 'https://vimeo.com/76979871', id: '' } },
      items: [{ video: { provider: 'url', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: '' } }],
    })).toEqual({
      video: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
      section: { video: { provider: 'vimeo', url: 'https://vimeo.com/76979871', id: '76979871' } },
      items: [{ video: { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' } }],
    })
  })

  it('treats an empty address as absent, leaving `required` to decide', () => {
    expect(validate({}, { provider: '', url: '', id: '' })).toBeUndefined()
    expect(validate({ required: true }, { provider: '', url: '', id: '' })).toEqual(['This field is required.'])
    expect(validate({}, 'https://youtu.be/dQw4w9WgXcQ')).toEqual(['Must be a video.'])
    expect(validate({}, { provider: '', url: 'not a url', id: '' }))
      .toEqual(['Must be a YouTube link, a Vimeo link, a VK Video link or a direct video URL.'])
  })
})

describe('field.seo', () => {
  it('emits the classic fields, and the sharing ones only when asked', () => {
    expect(Object.keys(field.seo().options.fields)).toEqual([
      'title',
      'description',
      'image',
      'shareSameAsPage',
      'ogTitle',
      'ogDescription',
    ])
    expect(Object.keys(field.seo({ image: false, social: false }).options.fields)).toEqual(['title', 'description'])
  })

  it('hides the sharing overrides behind the switch', () => {
    const fields = field.seo().options.fields
    expect(fields.ogTitle!.options.visibleWhen).toEqual({ field: 'shareSameAsPage', equals: false })
    expect(isFieldVisible(fields.ogTitle!.options, { shareSameAsPage: true })).toBe(false)
    expect(isFieldVisible(fields.ogTitle!.options, { shareSameAsPage: false })).toBe(true)
  })

  it('keeps the site-wide constants off the fields', () => {
    const definition = field.seo({ siteName: 'Karibsen', themeColor: '#111111' })
    expect(definition.seo).toEqual({ siteName: 'Karibsen', themeColor: '#111111' })
    expect(Object.keys(definition.options.fields)).not.toContain('siteName')
  })
})

describe('resolveEponymeSeo', () => {
  it('falls back to the page values while the switch is on', () => {
    const resolved = resolveEponymeSeo({ title: 'Homepage', description: 'A page', ogTitle: 'Stale' })
    expect(resolved.ogTitle).toBe('Homepage')
    expect(resolved.ogDescription).toBe('A page')
  })

  it('uses the overrides once the switch is off, and falls back when one is left empty', () => {
    const value = { title: 'Homepage', description: 'A page', shareSameAsPage: false, ogTitle: 'Shared' }
    const resolved = resolveEponymeSeo(value)
    expect(resolved.ogTitle).toBe('Shared')
    expect(resolved.ogDescription).toBe('A page')
  })

  it('reads the constants back from the definition, and tolerates an empty entry', () => {
    const definition = field.seo({ siteName: 'Karibsen', themeColor: '#111111' })
    expect(resolveEponymeSeo(undefined, definition)).toMatchObject({
      siteName: 'Karibsen',
      themeColor: '#111111',
      title: undefined,
    })
  })
})

describe('resolveLoginRedirect', () => {
  const config = {
    pages: { homepage: { title: field.string() } },
    articles: collection({ titleField: 'title', slugField: 'slug', fields: { title: field.string(), slug: field.slug() } }),
    contact: form({ fields: { email: field.email() } }),
  }

  /** Stands in for the dashboard router: everything unknown falls into the catch-all detail route. */
  function resolve(path: string) {
    const name = path.slice('/__eponyme'.length).replace(/^\//, '').split(/[?#]/)[0] ?? ''
    if (name === 'login') return { name: 'eponyme-login', params: {} }
    if (name === 'users') return { name: 'eponyme-users', params: {} }
    if (!name) return { name: 'eponyme-index', params: {} }
    return { name: 'eponyme-detail', params: { eponyme: name.split('/') } }
  }

  function redirect(target: unknown) {
    return resolveLoginRedirect(target, '/__eponyme', config, resolve)
  }

  it('keeps a target that still exists', () => {
    expect(redirect('/__eponyme/pages/homepage')).toBe('/__eponyme/pages/homepage')
    expect(redirect('/__eponyme/articles')).toBe('/__eponyme/articles')
    expect(redirect('/__eponyme/articles/hello-world')).toBe('/__eponyme/articles/hello-world')
    expect(redirect('/__eponyme/contact?page=2')).toBe('/__eponyme/contact?page=2')
    expect(redirect('/__eponyme/pages')).toBe('/__eponyme/pages')
    expect(redirect('/__eponyme/users')).toBe('/__eponyme/users')
  })

  it('falls back to the dashboard when the entry is gone', () => {
    expect(redirect('/__eponyme/removed')).toBe('/__eponyme')
    expect(redirect('/__eponyme/pages/removed')).toBe('/__eponyme')
    expect(redirect('/__eponyme/articles/hello/world')).toBe('/__eponyme')
  })

  it('ignores a missing or foreign target', () => {
    expect(redirect(undefined)).toBe('/__eponyme')
    expect(redirect('/somewhere-else')).toBe('/__eponyme')
    expect(redirect('//evil.test/__eponyme/articles')).toBe('/__eponyme')
    expect(redirect(['/__eponyme/articles', '/__eponyme/contact'])).toBe('/__eponyme/articles')
  })

  it('never sends the visitor back to the login page', () => {
    expect(redirect('/__eponyme/login')).toBe('/__eponyme')
  })
})
