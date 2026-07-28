import type { SlugFieldDefinition, SlugFieldOptions } from '../types/field'

export function slug(options: SlugFieldOptions = {}): SlugFieldDefinition {
  return { type: 'slug', options }
}
