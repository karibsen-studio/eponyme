import { describe, expect, it } from 'vitest'
import { field } from '../src/runtime/fields'
import { dateTimeToLocalInput, localInputToDateTime, normalizeEponymeDateTime } from '../src/runtime/utils/datetime'
import { normalizeEponymeValues } from '../src/runtime/utils/normalize-eponyme-values'

describe('field.datetime', () => {
  it('normalizes configured offsets to UTC', () => {
    expect(field.datetime({ defaultValue: '2026-08-08T14:30+02:00' })).toEqual({
      type: 'datetime',
      options: { defaultValue: '2026-08-08T12:30:00.000Z' },
    })
  })

  it.each([
    '2026-08-08T12:30',
    '2026-08-08T12:30:01Z',
    '2026-02-30T12:30Z',
  ])('rejects non-canonical configuration input %s', (value) => {
    expect(() => field.datetime({ min: value })).toThrow(/minute-precision ISO instant/)
  })
})

describe('datetime conversion', () => {
  it('normalizes minute-precision offsets', () => {
    expect(normalizeEponymeDateTime('2026-08-08T14:30:00+02:00')).toBe('2026-08-08T12:30:00.000Z')
  })

  it('converts a browser-local value to a canonical ISO instant', () => {
    const value = localInputToDateTime('2026-08-08T14:30')
    expect(value).not.toBeNull()
    expect(dateTimeToLocalInput(value)).toBe('2026-08-08T14:30')
  })

  it('normalizes offsets recursively before storage', () => {
    const datetime = field.datetime()
    const schema = {
      startsAt: datetime,
      section: field.section({ fields: { startsAt: datetime } }),
      tabs: field.tab({ tabs: { schedule: { fields: { startsAt: datetime } } } }),
      items: field.array({ of: { startsAt: datetime } }),
    }
    expect(normalizeEponymeValues(schema, {
      startsAt: '2026-08-08T14:30+02:00',
      section: { startsAt: '2026-08-08T14:30+02:00' },
      tabs: { schedule: { startsAt: '2026-08-08T14:30+02:00' } },
      items: [{ startsAt: '2026-08-08T14:30+02:00' }],
    })).toEqual({
      startsAt: '2026-08-08T12:30:00.000Z',
      section: { startsAt: '2026-08-08T12:30:00.000Z' },
      tabs: { schedule: { startsAt: '2026-08-08T12:30:00.000Z' } },
      items: [{ startsAt: '2026-08-08T12:30:00.000Z' }],
    })
  })
})
