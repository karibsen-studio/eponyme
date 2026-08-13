import { describe, expect, it } from 'vitest'
import { field, toMs } from '../src/eponyme'
import { joinMilliseconds, splitMilliseconds } from '../src/runtime/utils/duration'

describe('toMs', () => {
  it('parses readable duration strings', () => {
    expect(toMs('1h 10min')).toBe(4_200_000)
    expect(toMs('1h10min')).toBe(4_200_000)
    expect(toMs('1min 250ms')).toBe(60_250)
    expect(toMs('70min')).toBe(4_200_000)
    expect(toMs('1h 2min 3s 4ms')).toBe(3_723_004)
  })

  it('accepts already-normalized milliseconds', () => {
    expect(toMs(5_000)).toBe(5_000)
  })

  it.each(['', '1 hour', '-1h', '1.5h', '1h 2h'])('rejects invalid input %j', (value) => {
    expect(() => toMs(value)).toThrow()
  })

  it('rejects unsafe totals', () => {
    expect(() => toMs(Number.MAX_SAFE_INTEGER + 1)).toThrow()
    expect(() => toMs(`${Number.MAX_SAFE_INTEGER}h`)).toThrow()
  })
})

describe('field.duration', () => {
  it('normalizes readable options while keeping numeric stored values', () => {
    expect(field.duration({ defaultValue: '1h 10min', min: '30s', max: '12h' })).toEqual({
      type: 'duration',
      options: { defaultValue: 4_200_000, min: 30_000, max: 43_200_000 },
    })
  })

  it('rejects inverted bounds', () => {
    expect(() => field.duration({ min: '2h', max: '1h' })).toThrow(/min cannot be greater/)
  })

  it('splits and joins values without imposing a 24-hour limit', () => {
    const parts = splitMilliseconds(toMs('49h 2min 3s 4ms'))
    expect(parts).toEqual({ hours: 49, minutes: 2, seconds: 3, milliseconds: 4 })
    expect(joinMilliseconds(parts)).toBe(toMs('49h 2min 3s 4ms'))
  })
})
