import type { TabFieldDefinition, TabFieldOptions, TabsSchema } from '../types/field'

export function tab<const T extends TabsSchema>(options: TabFieldOptions<T>): TabFieldDefinition<T> {
  return { type: 'tabs', options }
}
