import type { DateTimeFieldDefinition, DateTimeFieldOptions } from '../types/field'
import { normalizeEponymeDateTime } from '../utils/datetime'

export function datetime(options: DateTimeFieldOptions = {}): DateTimeFieldDefinition {
  return {
    type: 'datetime',
    options: {
      ...options,
      ...normalizeOption('defaultValue', options.defaultValue),
      ...normalizeOption('min', options.min),
      ...normalizeOption('max', options.max),
    },
  }
}

function normalizeOption(key: 'defaultValue' | 'min' | 'max', value: string | undefined): Partial<DateTimeFieldOptions> {
  if (value === undefined) return {}
  const normalized = normalizeEponymeDateTime(value)
  if (normalized === null) throw new TypeError(`[Eponyme] field.datetime() ${key} must be a minute-precision ISO instant with an explicit time zone.`)
  return { [key]: normalized }
}
