import { afterEach, describe, expect, it } from 'vitest'
import { eponymeCustomFields } from '#eponyme/custom-fields'
import { defineEponymeField, field } from '../src/eponyme'
import type { EponymeCustomFieldTypeDefinition, EponymeSchema } from '../src/runtime/types'
import { createDefaultEponymeData } from '../src/runtime/utils/create-default-eponyme-data'
import { normalizeEponymeValues } from '../src/runtime/utils/normalize-eponyme-values'
import { validateEponymeData } from '../src/runtime/utils/validate-eponyme-data'
import { schemaFingerprint } from '../src/runtime/server/services/eponyme-store'

interface RatingOptions {
  min?: number
  max?: number
}

const registry = eponymeCustomFields as unknown as Record<string, EponymeCustomFieldTypeDefinition<unknown, Record<string, unknown>>>

function registerRating() {
  registry.rating = defineEponymeField<number, RatingOptions>({
    defaultValue: 3,
    normalize: value => typeof value === 'string' ? Number(value) : value,
    validate(value, options) {
      const min = options.min ?? 1
      const max = options.max ?? 5
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
        ? true
        : `Must be an integer from ${min} to ${max}.`
    },
  }) as EponymeCustomFieldTypeDefinition<unknown, Record<string, unknown>>
}

afterEach(() => {
  delete registry.rating
})

describe('custom fields', () => {
  it('requires a complete field type definition', () => {
    expect(() => defineEponymeField({ validate: () => true } as never)).toThrow(/defaultValue/)
    expect(() => defineEponymeField({ defaultValue: 0 } as never)).toThrow(/validate/)
    expect(() => defineEponymeField({ defaultValue: 0, normalize: true, validate: () => true } as never)).toThrow(/normalize/)
  })

  it('keeps custom fields as leaves', () => {
    expect(() => field.custom('Rating')).toThrow(/lowercase/)
    expect(() => field.custom('rating', { fields: {} })).toThrow(/leaves/)
    expect(() => field.custom('rating', { tabs: {} })).toThrow(/leaves/)
    expect(() => field.custom('rating', { of: field.string() })).toThrow(/leaves/)
  })

  it('applies defaults, normalization and validation at every supported depth', () => {
    registerRating()
    const rating = field.custom('rating', { min: 1, max: 5 })
    const schema = {
      rating,
      section: field.section({ fields: { rating } }),
      tabs: field.tab({ tabs: { review: { fields: { rating } } } }),
      rows: field.array({ of: { rating } }),
    } satisfies EponymeSchema

    expect(createDefaultEponymeData(schema)).toEqual({
      rating: 3,
      section: { rating: 3 },
      tabs: { review: { rating: 3 } },
      rows: [],
    })
    expect(createDefaultEponymeData({ rating: field.custom('rating', { defaultValue: 4 }) })).toEqual({ rating: 4 })

    const normalized = normalizeEponymeValues(schema, {
      rating: '4',
      section: { rating: '5' },
      tabs: { review: { rating: '2' } },
      rows: [{ rating: '1' }],
    })
    expect(normalized).toEqual({
      rating: 4,
      section: { rating: 5 },
      tabs: { review: { rating: 2 } },
      rows: [{ rating: 1 }],
    })
    expect(validateEponymeData(schema, normalized)).toEqual({})

    expect(validateEponymeData(schema, {
      rating: 6,
      section: { rating: 0 },
      tabs: { review: { rating: 2.5 } },
      rows: [{ rating: 'bad' }],
    })).toEqual({
      'rating': ['Must be an integer from 1 to 5.'],
      'section.rating': ['Must be an integer from 1 to 5.'],
      'tabs.review.rating': ['Must be an integer from 1 to 5.'],
      'rows.0.rating': ['Must be an integer from 1 to 5.'],
    })
  })

  it('puts the registered field name in the schema fingerprint', () => {
    expect(schemaFingerprint({ score: field.custom('rating') }))
      .not.toBe(schemaFingerprint({ score: field.custom('stars') }))
  })

  it('reports an undeclared custom field instead of using the text fallback', () => {
    expect(() => createDefaultEponymeData({ score: field.custom('missing') })).toThrow(/Unknown custom field "missing"/)
  })
})
