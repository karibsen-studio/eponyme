import type { SelectFieldDefinition, SelectFieldOptions } from '../types/field'

export function select<const T extends string>(options: SelectFieldOptions<T>): SelectFieldDefinition<T> {
  return { type: 'select', options }
}
