import { describe, expect, it } from 'vitest'
import { field } from '../src/runtime/fields'
import { validateEponymeData, validateEponymePatch } from '../src/runtime/utils/validate-eponyme-data'
import { buildEponymeSchema, validateWithSchema } from '../src/runtime/utils/build-eponyme-schema'
import type { EponymeSchema } from '../src/runtime/types'

/**
 * Behavioural contract of the validator, pinned before the zod migration.
 * Every case here uses top-level fields, whose error keys are the field name in both the
 * old and the new implementation — so this file must stay green across the migration.
 * Nested error keys (which become paths) are covered separately.
 */

function validate(schema: EponymeSchema, data: Record<string, unknown>, mode: 'draft' | 'publish' = 'publish') {
  return validateEponymeData(schema, data, mode)
}

describe('validateEponymeData — required and modes', () => {
  const schema = { title: field.string({ required: true, minLength: 3 }) } satisfies EponymeSchema

  it('only enforces required and minimum length when publishing', () => {
    expect(validate(schema, { title: '' }, 'draft')).toEqual({})
    expect(validate(schema, { title: undefined }, 'draft')).toEqual({})
    // An empty required string trips both the required rule and the length rule.
    expect(validate(schema, { title: '' })).toEqual({
      title: ['This field is required.', 'Must contain at least 3 characters.'],
    })
    expect(validate(schema, { title: undefined })).toEqual({ title: ['This field is required.'] })
    expect(validate(schema, { title: 'ab' })).toEqual({ title: ['Must contain at least 3 characters.'] })
    expect(validate(schema, { title: 'abc' })).toEqual({})
  })

  it('enforces maximum length in both modes', () => {
    const capped = { title: field.string({ maxLength: 4 }) } satisfies EponymeSchema
    expect(validate(capped, { title: 'abcde' }, 'draft')).toEqual({ title: ['Must contain at most 4 characters.'] })
    expect(validate(capped, { title: 'abcde' })).toEqual({ title: ['Must contain at most 4 characters.'] })
  })

  it('rejects a value of the wrong type', () => {
    expect(validate(schema, { title: 42 })).toEqual({ title: ['Must be a string.'] })
  })
})

describe('validateEponymeData — per field type', () => {
  it('validates string format options', () => {
    const schema = {
      code: field.string({ regex: /^[A-Z]+$/ }),
      contact: field.string({ email: true }),
      link: field.string({ url: true }),
    } satisfies EponymeSchema
    expect(validate(schema, { code: 'abc', contact: 'nope', link: 'ftp://x' })).toEqual({
      code: ['Has an invalid format.'],
      contact: ['Must be a valid email address.'],
      link: ['Must be an HTTP(S) URL.'],
    })
    expect(validate(schema, { code: 'ABC', contact: 'a@b.co', link: 'https://a.co' })).toEqual({})
  })

  it('validates email, image, slug, color and date fields', () => {
    const schema = {
      mail: field.email(),
      picture: field.image(),
      handle: field.slug(),
      accent: field.color(),
      day: field.date({ min: '2026-01-01', max: '2026-12-31' }),
    } satisfies EponymeSchema
    expect(validate(schema, {
      mail: 'a@b',
      picture: '/local.png',
      handle: 'Not A Slug',
      accent: 'red',
      day: '2025-06-01',
    })).toEqual({
      mail: ['Must be a valid email address.'],
      picture: ['Must be an HTTP(S) URL.'],
      handle: ['Must contain only lowercase letters, numbers and single hyphens.'],
      accent: ['Must be a valid hex color.'],
      day: ['Must be on or after 2026-01-01.'],
    })
    expect(validate(schema, { day: '2026-02-30' })).toEqual({ day: ['Must be a valid date.'] })
    expect(validate(schema, {
      mail: 'a@b.co',
      picture: 'https://cdn.test/a.png',
      handle: 'my-slug',
      accent: '#aabbcc',
      day: '2026-06-01',
    })).toEqual({})
  })

  it('validates numbers and booleans', () => {
    const schema = {
      size: field.number({ min: 2, max: 4 }),
      enabled: field.boolean(),
    } satisfies EponymeSchema
    expect(validate(schema, { size: 1, enabled: 'yes' })).toEqual({
      size: ['Must be at least 2.'],
      enabled: ['Must be a boolean.'],
    })
    expect(validate(schema, { size: 5 })).toEqual({ size: ['Must be at most 4.'] })
    expect(validate(schema, { size: Number.NaN })).toEqual({ size: ['Must be a number.'] })
    expect(validate(schema, { size: 3, enabled: false })).toEqual({})
  })

  it('restricts select and radio values to the configured options', () => {
    const schema = {
      theme: field.select({ options: [{ label: 'Dark', value: 'dark' }] }),
      size: field.radio({ options: [{ label: 'Small', value: 'sm' }] }),
    } satisfies EponymeSchema
    expect(validate(schema, { theme: 'light', size: 'xl' })).toEqual({
      theme: ['Must be one of the available options.'],
      size: ['Must be one of the available options.'],
    })
    expect(validate(schema, { theme: 'dark', size: 'sm' })).toEqual({})
  })

  it('validates checkbox groups', () => {
    const schema = {
      tags: field.checkboxGroup({
        options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
        minItems: 1,
        maxItems: 2,
      }),
    } satisfies EponymeSchema
    expect(validate(schema, { tags: 'a' })).toEqual({ tags: ['Must be an array.'] })
    expect(validate(schema, { tags: [] })).toEqual({ tags: ['Must contain at least 1 items.'] })
    expect(validate(schema, { tags: [] }, 'draft')).toEqual({})
    expect(validate(schema, { tags: ['a', 'b', 'a'] })).toEqual({ tags: ['Must contain at most 2 items.'] })
    expect(validate(schema, { tags: ['c'] })).toEqual({ tags: ['Must contain only available options.'] })
    expect(validate(schema, { tags: ['a'] })).toEqual({})
  })

  it('validates link fields', () => {
    const schema = { cta: field.url({ required: true }) } satisfies EponymeSchema
    expect(validate(schema, { cta: 'https://a.co' })).toEqual({ cta: ['Must be a link.'] })
    expect(validate(schema, { cta: { href: 'a', type: 'external' } })).toEqual({ cta: ['Must be a valid link.'] })
    expect(validate(schema, { cta: { href: 'example.com', type: 'external', openInNewTab: true } }))
      .toEqual({ cta: ['External links must be HTTP(S) URLs.'] })
    expect(validate(schema, { cta: { href: 'about', type: 'internal', openInNewTab: false } }))
      .toEqual({ cta: ['Internal links must start with / or #.'] })
    expect(validate(schema, { cta: { href: '', type: 'internal', openInNewTab: false } }))
      .toEqual({ cta: ['This field is required.'] })
    expect(validate(schema, { cta: { href: '/about', type: 'internal', openInNewTab: false } })).toEqual({})
  })

  it('counts rich text length on the text content, not the markup', () => {
    const schema = { body: field.richText({ minLength: 5, maxLength: 10 }) } satisfies EponymeSchema
    expect(validate(schema, { body: '<p>abc</p>' })).toEqual({ body: ['Must contain at least 5 characters.'] })
    expect(validate(schema, { body: '<p><strong>hello</strong></p>' })).toEqual({})
    expect(validate(schema, { body: '<p>hello world!</p>' })).toEqual({ body: ['Must contain at most 10 characters.'] })
  })

  it('validates arrays of scalars and their item count', () => {
    const schema = {
      tags: field.array({ of: field.string({ minLength: 2 }), minItems: 1, maxItems: 2 }),
    } satisfies EponymeSchema
    expect(validate(schema, { tags: 'nuxt' })).toEqual({ tags: ['Must be an array.'] })
    expect(validate(schema, { tags: [] })).toEqual({ tags: ['Must contain at least 1 items.'] })
    expect(validate(schema, { tags: ['a', 'b', 'c'] })).toMatchObject({ tags: expect.arrayContaining(['Must contain at most 2 items.']) })
  })
})

describe('validateEponymeData — visibility and custom validators', () => {
  it('skips fields hidden by visibleWhen', () => {
    const schema = {
      showDate: field.boolean(),
      day: field.date({ required: true, visibleWhen: { field: 'showDate', equals: true } }),
    } satisfies EponymeSchema
    expect(validate(schema, { showDate: false, day: '' })).toEqual({})
    expect(validate(schema, { showDate: true, day: '' })).toEqual({ day: ['This field is required.'] })
  })

  it('runs the custom validator only once the built-in rules pass', () => {
    const schema = {
      title: field.string({
        minLength: 3,
        validate: value => value.startsWith('a') ? true : 'Must start with a.',
      }),
    } satisfies EponymeSchema
    // The built-in failure short-circuits the custom validator.
    expect(validate(schema, { title: 'zz' })).toEqual({ title: ['Must contain at least 3 characters.'] })
    expect(validate(schema, { title: 'zzz' })).toEqual({ title: ['Must start with a.'] })
    expect(validate(schema, { title: 'abc' })).toEqual({})
  })

  it('reports a thrown custom validator instead of crashing', () => {
    const schema = {
      title: field.string({ validate: () => { throw new Error('boom') } }),
    } satisfies EponymeSchema
    expect(validate(schema, { title: 'anything' })).toEqual({ title: ['Custom validation failed.'] })
  })

  it('passes the sibling values to the custom validator', () => {
    const schema = {
      min: field.number(),
      max: field.number({ validate: (value, data) => value > Number(data.min) ? true : 'Must be greater than min.' }),
    } satisfies EponymeSchema
    expect(validate(schema, { min: 5, max: 2 })).toEqual({ max: ['Must be greater than min.'] })
    expect(validate(schema, { min: 5, max: 9 })).toEqual({})
  })
})

describe('validateEponymeData — nested error paths', () => {
  const schema = {
    hero: field.section({
      fields: {
        title: field.string({ required: true }),
        theme: field.select({ options: [{ label: 'Warm', value: 'warm' }] }),
      },
    }),
    options: field.tab({
      tabs: { seo: { label: 'SEO', fields: { title: field.string({ required: true }) } } },
    }),
    tags: field.array({ of: field.string({ minLength: 2 }) }),
    projects: field.array({ of: { title: field.string({ required: true }) } }),
  } satisfies EponymeSchema

  it('keys each message by the path of the field that produced it', () => {
    expect(validate(schema, {
      hero: { title: '', theme: 'blue', unknown: 1 },
      options: { seo: { title: '' } },
      tags: ['a'],
      projects: [{ title: '' }],
    })).toEqual({
      'hero.title': ['This field is required.'],
      'hero.theme': ['Must be one of the available options.'],
      'hero.unknown': ['Unknown field.'],
      'options.seo.title': ['This field is required.'],
      'tags.0': ['Must contain at least 2 characters.'],
      'projects.0.title': ['This field is required.'],
    })
  })

  it('reports a malformed container on the container itself', () => {
    expect(validate(schema, { hero: 'nope', options: { seo: 'nope', ghost: {} }, tags: 'nope' })).toMatchObject({
      'hero': ['Must be an object.'],
      'options.seo': ['Must be an object.'],
      'options.ghost': ['Unknown tab.'],
      'tags': ['Must be an array.'],
    })
  })

  it('does not crash on a field named __proto__', () => {
    const polluted = { __proto__: field.string({ required: true }) } as unknown as EponymeSchema
    expect(() => validate(polluted, { __proto__: '' })).not.toThrow()
  })
})

describe('buildEponymeSchema', () => {
  const schema = {
    hero: field.section({ fields: { title: field.string({ required: true }) } }),
  } satisfies EponymeSchema

  it('exposes the rules as a zod schema with structured issue paths', () => {
    const result = buildEponymeSchema(schema, 'publish').safeParse({ hero: { title: '' } })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]).toMatchObject({
      path: ['hero', 'title'],
      message: 'This field is required.',
    })
  })

  it('uses array indices in issue paths', () => {
    const withArray = { tags: field.array({ of: field.string({ minLength: 2 }) }) } satisfies EponymeSchema
    const result = buildEponymeSchema(withArray, 'publish').safeParse({ tags: ['a'] })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path).toEqual(['tags', 0])
  })

  it('rejects a non-object payload', () => {
    expect(buildEponymeSchema(schema).safeParse('nope').success).toBe(false)
  })

  it('returns the same cached instance per schema and mode', () => {
    expect(buildEponymeSchema(schema, 'draft')).toBe(buildEponymeSchema(schema, 'draft'))
    expect(buildEponymeSchema(schema, 'draft')).not.toBe(buildEponymeSchema(schema, 'publish'))
  })

  it('round-trips zod issues back to path-keyed errors', () => {
    expect(validateWithSchema(schema, { hero: { title: '' } })).toEqual({ 'hero.title': ['This field is required.'] })
    expect(validateWithSchema(schema, { hero: { title: 'ok' } })).toEqual({})
  })
})

describe('validateEponymePatch', () => {
  const schema = {
    title: field.string({ required: true }),
    enabled: field.boolean(),
  } satisfies EponymeSchema

  it('only validates the submitted keys', () => {
    expect(validateEponymePatch(schema, { enabled: true })).toEqual({})
    expect(validateEponymePatch(schema, { enabled: 'nope' })).toEqual({ enabled: ['Must be a boolean.'] })
  })

  it('rejects unknown fields and non-object bodies', () => {
    expect(validateEponymePatch(schema, { nope: 1 })).toEqual({ nope: ['Unknown field.'] })
    expect(validateEponymePatch(schema, 'not an object')).toEqual({ _form: ['Body must be an object.'] })
    expect(validateEponymePatch(schema, [])).toEqual({ _form: ['Body must be an object.'] })
  })
})
