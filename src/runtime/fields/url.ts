import type { UrlFieldDefinition, UrlFieldOptions } from '../types/field'

export function url(options: UrlFieldOptions = {}): UrlFieldDefinition {
  return { type: 'url', options }
}
