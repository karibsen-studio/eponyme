import { describe, expect, it } from 'vitest'
import { field } from '../src/runtime/fields'
import { validateEponymeData } from '../src/runtime/utils/validate-eponyme-data'
import { schemaFingerprint } from '../src/runtime/server/services/eponyme-store'
import type { EponymeSchema } from '../src/runtime/types'

describe('field.masked', () => {
  it('is a string field, so nothing downstream has to learn a new type', () => {
    expect(field.masked({ mask: '###' })).toMatchObject({ type: 'string' })
  })

  it('leaves the schema fingerprint alone, so exports taken before the mask still import', () => {
    expect(schemaFingerprint({ siret: field.masked({ mask: '###' }) }))
      .toBe(schemaFingerprint({ siret: field.string() }))
  })

  it('carries the mask through to the editor', () => {
    expect(field.masked({ mask: '@@-###-@@' }).options.mask).toBe('@@-###-@@')
  })

  it('derives a regex from the mask, since the server never sees the mask itself', () => {
    expect(field.masked({ mask: '###' }).options.regex?.source).toBe('^(?:\\d\\d\\d)?$')
    expect(field.masked({ mask: '@*' }).options.regex?.source).toBe('^(?:[a-zA-Z][a-zA-Z0-9])?$')
  })

  it('escapes the literals, which would otherwise read as regex syntax', () => {
    const regex = field.masked({ mask: '##.##' }).options.regex
    expect(regex?.test('12.34')).toBe(true)
    expect(regex?.test('12x34')).toBe(false)
  })

  it('carries the ordinary string options through', () => {
    expect(field.masked({ mask: '###', required: true, label: 'SIRET' }).options)
      .toMatchObject({ required: true, label: 'SIRET' })
  })
})

describe('field.masked: validation', () => {
  const schema = { siret: field.masked({ mask: '### ### ### #####' }) } satisfies EponymeSchema

  it('accepts a value in the masked format', () => {
    expect(validateEponymeData(schema, { siret: '123 456 789 00012' })).toEqual({})
  })

  it('rejects an incomplete value, which the mask alone would allow', () => {
    expect(validateEponymeData(schema, { siret: '123 456' })).toEqual({
      siret: ['Has an invalid format.'],
    })
  })

  it('rejects the unmasked value, since the masked form is what is stored', () => {
    expect(validateEponymeData(schema, { siret: '12345678900012' })).toEqual({
      siret: ['Has an invalid format.'],
    })
  })

  it('leaves an empty optional field alone, since presence is required\'s job', () => {
    expect(validateEponymeData(schema, { siret: '' })).toEqual({})
    expect(validateEponymeData({ siret: field.masked({ mask: '###', required: true }) }, { siret: '' }))
      .toEqual({ siret: ['This field is required.'] })
  })
})
