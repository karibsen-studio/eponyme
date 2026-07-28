import type { SectionFieldDefinition, SectionFieldOptions, SectionSchema } from '../types/field'

export function section<const T extends SectionSchema>(options: SectionFieldOptions<T>): SectionFieldDefinition<T> {
  return { type: 'section', options }
}
