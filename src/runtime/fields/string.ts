import type { StringFieldDefinition, StringFieldOptions } from '../types/field'

export function string(options: StringFieldOptions = {}): StringFieldDefinition {
  return { type: 'string', options }
}
