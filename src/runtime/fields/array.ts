import type { ArrayFieldDefinition, ArrayFieldOptions, ArrayItemDefinition } from '../types/field'

export function array<const T extends ArrayItemDefinition>(options: ArrayFieldOptions<T>): ArrayFieldDefinition<T> {
  return { type: 'array', options }
}
