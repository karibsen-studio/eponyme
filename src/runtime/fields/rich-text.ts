import type { RichTextFieldDefinition, RichTextFieldOptions } from '../types/field'

export function richText(options: RichTextFieldOptions = {}): RichTextFieldDefinition {
  return { type: 'richText', options }
}
