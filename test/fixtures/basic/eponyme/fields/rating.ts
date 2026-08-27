import { defineEponymeField } from '../../../../../src/config/field.ts'

export interface RatingFieldOptions {
  min?: number
  max?: number
}

export default defineEponymeField<number, RatingFieldOptions>({
  defaultValue: 3,
  normalize: value => typeof value === 'string' && value.trim() ? Number(value) : value,
  validate(value, options) {
    const min = options.min ?? 1
    const max = options.max ?? 5
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
      ? true
      : `Must be an integer from ${min} to ${max}.`
  },
})
