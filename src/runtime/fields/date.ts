import type { DateFieldDefinition, DateFieldOptions, TodayDateDefault } from '../types/field'

export function today(): TodayDateDefault {
  return { __eponymeDefault: 'today' }
}

export function date(options: DateFieldOptions = {}): DateFieldDefinition {
  return { type: 'date', options }
}
