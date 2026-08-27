import type { EponymeCustomFieldRegistry } from '#eponyme/custom-fields'
import type {
  EponymeCustomFieldDefinition,
  EponymeCustomFieldOptions,
  EponymeCustomFieldTypeDefinition,
  InferEponymeCustomFieldOptions,
  InferEponymeCustomFieldValue,
} from '../types/field'

type RegisteredDefinition<Name extends string>
  = Name extends keyof EponymeCustomFieldRegistry
    ? EponymeCustomFieldRegistry[Name]
    : EponymeCustomFieldTypeDefinition<unknown, Record<string, unknown>>

type RegisteredValue<Name extends string> = InferEponymeCustomFieldValue<RegisteredDefinition<Name>>
type RegisteredOptions<Name extends string> = InferEponymeCustomFieldOptions<RegisteredDefinition<Name>>

export function custom<const Name extends string>(
  name: Name,
  options: EponymeCustomFieldOptions<RegisteredValue<Name>, RegisteredOptions<Name>> = {} as EponymeCustomFieldOptions<RegisteredValue<Name>, RegisteredOptions<Name>>,
): EponymeCustomFieldDefinition<Name, RegisteredValue<Name>, RegisteredOptions<Name>> {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new TypeError('[Eponyme] A custom field name must use lowercase letters, numbers and hyphens, and start with a letter.')

  for (const reserved of ['fields', 'tabs', 'of'] as const) {
    if (Object.hasOwn(options, reserved))
      throw new TypeError(`[Eponyme] Custom fields are leaves, so their options cannot declare "${reserved}".`)
  }

  return { type: 'custom', name, options }
}
