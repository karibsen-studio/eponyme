import type { CheckboxGroupFieldDefinition, CheckboxGroupFieldOptions } from '../types/field'

export function checkboxGroup<const T extends string>(options: CheckboxGroupFieldOptions<T>): CheckboxGroupFieldDefinition<T> {
  return { type: 'checkboxGroup', options }
}
