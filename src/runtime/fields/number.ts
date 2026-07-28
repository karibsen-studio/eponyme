import type { NumberFieldDefinition, NumberFieldOptions } from '../types/field'

export function number(options: NumberFieldOptions = {}): NumberFieldDefinition {
  return { type: 'number', options }
}
