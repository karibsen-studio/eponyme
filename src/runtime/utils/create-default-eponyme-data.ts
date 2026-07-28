import type { EponymeConfig, EponymeData, EponymeSchema } from '../types'
import { getFieldDefaultValue } from './get-field-default-value'
import { getEponymeSchemas } from './get-eponyme-schemas'

export function createDefaultEponymeData<T extends EponymeSchema>(schema: T): EponymeData<T> {
  return Object.fromEntries(
    Object.entries(schema).map(([name, definition]) => [name, getFieldDefaultValue(definition)]),
  ) as EponymeData<T>
}

export function createDefaultEponymeDataByConfig<T extends EponymeConfig>(config: T) {
  return Object.fromEntries(
    Object.entries(getEponymeSchemas(config)).map(([name, schema]) => [name, createDefaultEponymeData(schema)]),
  )
}
