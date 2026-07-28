import type { TextareaFieldDefinition, TextareaFieldOptions } from '../types/field'

export function textarea(options: TextareaFieldOptions = {}): TextareaFieldDefinition {
  return { type: 'textarea', options }
}
