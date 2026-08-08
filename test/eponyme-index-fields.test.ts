import { describe, expect, it } from 'vitest'
import { field } from '../src/runtime/fields'
import { buildEponymeIndexRows, describeEponymeIndexSchema, eponymeIndexKeys } from '../src/runtime/utils/eponyme-entry-index'

describe('datetime and duration indexes', () => {
  const schema = {
    startsAt: field.datetime(),
    runtime: field.duration(),
  }

  it('indexes datetime but not numeric duration', () => {
    expect(eponymeIndexKeys(schema)).toEqual(['startsAt'])
    expect(buildEponymeIndexRows('events/example', schema, {
      draft: { startsAt: '2026-08-08T12:30:00.000Z', runtime: 4_200_000 },
      published: {},
    })).toEqual([{
      entryName: 'events/example',
      version: 'draft',
      key: 'startsAt',
      value: '2026-08-08t12:30:00.000z',
    }])
  })

  it('uses the widened index algorithm version', () => {
    expect(describeEponymeIndexSchema(schema)).toMatch(/^v2\|/)
  })
})
