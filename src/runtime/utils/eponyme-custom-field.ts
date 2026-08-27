import { eponymeCustomFields } from '#eponyme/custom-fields'
import type { EponymeCustomFieldTypeDefinition } from '../types/field'

export function getEponymeCustomFieldType(name: string): EponymeCustomFieldTypeDefinition<unknown, Record<string, unknown>> {
  const definition = (eponymeCustomFields as unknown as Record<string, EponymeCustomFieldTypeDefinition<unknown, Record<string, unknown>>>)[name]
  if (!definition)
    throw new Error(`[Eponyme] Unknown custom field "${name}". Add eponyme/fields/${name}.ts and eponyme/fields/${name}.vue.`)
  return definition
}
