import type { PhoneFieldDefinition, PhoneFieldOptions } from '../types/field'

export function phone(options: PhoneFieldOptions = {}): PhoneFieldDefinition {
  return { type: 'phone', options }
}
