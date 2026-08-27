import type { EponymeCustomFieldTypeDefinition } from '../runtime/types/field'

export function defineEponymeField<Value, Options extends object = Record<string, never>>(
  definition: EponymeCustomFieldTypeDefinition<Value, Options>,
): EponymeCustomFieldTypeDefinition<Value, Options> {
  if (!Object.hasOwn(definition, 'defaultValue'))
    throw new TypeError('[Eponyme] A custom field must declare a defaultValue.')
  if (definition.normalize !== undefined && typeof definition.normalize !== 'function')
    throw new TypeError('[Eponyme] A custom field normalize option must be a function.')
  if (typeof definition.validate !== 'function')
    throw new TypeError('[Eponyme] A custom field must declare a validate function.')
  return definition
}
