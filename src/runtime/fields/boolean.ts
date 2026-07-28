import type { BooleanFieldDefinition, BooleanFieldOptions } from '../types/field'

export function boolean(options: BooleanFieldOptions = {}): BooleanFieldDefinition {
  return { type: 'boolean', options }
}
