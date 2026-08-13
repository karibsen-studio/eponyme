import { describe, expect, it } from 'vitest'
import { field } from '../src/runtime/fields'

describe('field.money', () => {
  it('is a number field, so nothing downstream has to learn a new type', () => {
    expect(field.money()).toMatchObject({ type: 'number' })
  })

  it('puts the symbol where the currency puts it', () => {
    expect(field.money({ currency: 'USD' }).options).toMatchObject({ prefix: '$', step: 0.01 })
    expect(field.money({ currency: 'EUR' }).options).toMatchObject({ suffix: '€', step: 0.01 })
    expect(field.money().options).toMatchObject({ suffix: '€' })
  })

  it('steps by the currency minor unit, which some currencies do not have', () => {
    expect(field.money({ currency: 'JPY' }).options).toMatchObject({ prefix: '¥', step: 1 })
    expect(field.money({ currency: 'XOF' }).options).toMatchObject({ suffix: 'CFA', step: 1 })
  })

  it('carries the ordinary number options through', () => {
    expect(field.money({ currency: 'GBP', label: 'Price', min: 0, max: 500, required: true }).options)
      .toMatchObject({ label: 'Price', min: 0, max: 500, required: true, prefix: '£' })
  })

  it('lets an author override the symbol, its side and the step', () => {
    expect(field.money({ currency: 'USD', position: 'suffix' }).options).toMatchObject({ suffix: '$' })
    expect(field.money({ symbol: 'sats', position: 'suffix', step: 1 }).options).toMatchObject({ suffix: 'sats', step: 1 })
  })

  it('leaves min alone, because an amount can be negative', () => {
    expect(field.money().options.min).toBeUndefined()
  })
})
