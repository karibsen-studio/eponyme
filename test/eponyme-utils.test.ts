import { describe, expect, it } from 'vitest'
import { humanizeLabel } from '../src/runtime/utils/humanize-label'
import { asRecord } from '../src/runtime/utils/as-record'
import { childErrors, errorsAt, fieldPathId, hasErrorsUnder, joinFieldPath } from '../src/runtime/utils/field-path'
import { normalizeHexColor, sameHexColor } from '../src/runtime/utils/normalize-hex-color'
import { collection } from '../src/config/collection'
import { form } from '../src/config/form'
import { field } from '../src/runtime/fields'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas, isEponymeForm, isEponymeSchema } from '../src/runtime/utils/get-eponyme-schemas'
import noCaptcha from '../src/runtime/utils/no-captcha'
import { interpolateEponymeText, interpolateEponymeValue, resolveEponymeVariables, summariseEponymeVariables } from '../src/runtime/utils/variables'
import { applyPreviewSlug, readPreviewQuery, readPreviewVersion, resolvePreviewPath } from '../src/runtime/utils/preview'
import { buildEponymeNavigationTree } from '../src/runtime/utils/build-navigation-tree'
import { filterEponymeNavigationTree } from '../src/runtime/utils/filter-navigation-tree'

describe('humanizeLabel', () => {
  it('turns a field name into a title', () => {
    expect(humanizeLabel('launch_date')).toBe('Launch Date')
    expect(humanizeLabel('hero-title')).toBe('Hero Title')
    expect(humanizeLabel('title')).toBe('Title')
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

  it('rejects anything that is not a hex colour', () => {
    expect(normalizeHexColor('red')).toBeUndefined()
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
    expect(contact.honeypot).toBe('_eponyme_hp')
    expect(contact.maxBodyBytes).toBe(64 * 1024)
  })

  it('keeps an explicit managed mode and overrides', () => {
    const contact = form({
      fields: { email: field.email() },
      submission: { mode: 'managed' },
      honeypot: false,
      maxBodyBytes: 1024,
    })
    expect(contact.submission.mode).toBe('managed')
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

  // TypeScript already rejects these at the call site — the @ts-expect-error
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

describe('captcha contract', () => {
  it('refuses every token when no adapter is installed', async () => {
    // Failing closed matters: a form that asked for a captcha must not accept
    // submissions just because the adapter is missing.
    expect(noCaptcha.name).toBe('none')
    await expect(noCaptcha.verify('anything', {})).resolves.toMatchObject({ success: false })
  })

  it('keeps the captcha option off unless asked', () => {
    expect(form({ fields: { email: field.email() } }).captcha).toBe(false)
    expect(form({ fields: { email: field.email() }, captcha: true }).captcha).toBe(true)
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
