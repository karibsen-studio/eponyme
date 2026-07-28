import type { EmailFieldDefinition, EmailFieldOptions } from '../types/field'

export function email(options: EmailFieldOptions = {}): EmailFieldDefinition {
  return { type: 'email', options }
}
