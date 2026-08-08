import type { DurationFieldDefinition, DurationFieldOptions, NormalizedDurationFieldOptions } from '../types/field'
import { toMs } from '../utils/duration'

export function duration(options: DurationFieldOptions = {}): DurationFieldDefinition {
  const { defaultValue, min, max, ...commonOptions } = options
  const normalized: NormalizedDurationFieldOptions = {
    ...commonOptions,
    ...normalizeOption('defaultValue', defaultValue),
    ...normalizeOption('min', min),
    ...normalizeOption('max', max),
  }

  if (normalized.min !== undefined && normalized.max !== undefined && normalized.min > normalized.max)
    throw new RangeError('[Eponyme] field.duration() min cannot be greater than max.')

  return { type: 'duration', options: normalized }
}

function normalizeOption(key: 'defaultValue' | 'min' | 'max', value: DurationFieldOptions[typeof key]): Partial<NormalizedDurationFieldOptions> {
  return value === undefined ? {} : { [key]: toMs(value) }
}
