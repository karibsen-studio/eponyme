import { describe, expect, it } from 'vitest'
import { humanizeLabel } from '../src/runtime/utils/humanize-label'
import { asRecord } from '../src/runtime/utils/as-record'
import { childErrors, errorsAt, fieldPathId, hasErrorsUnder, joinFieldPath } from '../src/runtime/utils/field-path'
import { normalizeHexColor, sameHexColor } from '../src/runtime/utils/normalize-hex-color'
import { collection } from '../src/config/collection'
import { form } from '../src/config/form'
import { field } from '../src/runtime/fields'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas, isEponymeForm, isEponymeSchema } from '../src/runtime/utils/get-eponyme-schemas'
import { applyPreviewSlug, readPreviewQuery, readPreviewVersion, resolvePreviewPath } from '../src/runtime/utils/preview'

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

  it('rejects authoring-only field types', () => {
    expect(() => form({ fields: { body: field.richText() } })).toThrow(/field\.richText\(\)/)
    expect(() => form({ fields: { slug: field.slug() } })).toThrow(/not available in a public form/)
    expect(() => form({ fields: { cover: field.image() } })).toThrow(/field\.image\(\)/)
    expect(() => form({ fields: { day: field.date() } })).toThrow(/field\.date\(\)/)
    expect(() => form({ fields: { tint: field.color() } })).toThrow(/field\.color\(\)/)
    expect(() => form({ fields: { items: field.array({ of: field.string() }) } })).toThrow(/field\.array\(\)/)
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
