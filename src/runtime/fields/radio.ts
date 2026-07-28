import type { RadioFieldDefinition, RadioFieldOptions } from '../types/field'

export function radio<const T extends string>(options: RadioFieldOptions<T>): RadioFieldDefinition<T> {
  return { type: 'radio', options }
}
