import type { ArrayItemDefinition, FieldDefinition } from '../types/field'
import type { EponymeSchema } from '../types'
import { isArrayItemFieldDefinition } from './get-field-default-value'
import { toEponymePhoneValue } from './normalize-phone'

/**
 * Rewrites every phone value in a payload to E.164, wherever it sits in the schema.
 *
 * Applied on the server before a write, which is what makes the stored format a guarantee
 * rather than a convention: the API accepts any JSON, so a client normalising on its own could
 * always be bypassed. Values that cannot be parsed are left as typed for validation to reject.
 */
export function normalizeEponymePhones(schema: EponymeSchema, data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data }
  for (const [name, definition] of Object.entries(schema)) {
    if (!(name in result)) continue
    result[name] = normalizeField(definition, result[name])
  }
  return result
}

function normalizeField(definition: FieldDefinition, value: unknown): unknown {
  if (definition.type === 'phone') return toEponymePhoneValue(value, definition.options)

  if (definition.type === 'section')
    return normalizeNested(definition.options.fields, value)

  if (definition.type === 'tabs') {
    if (!isRecord(value)) return value
    const tabs = { ...value }
    for (const [tabName, tab] of Object.entries(definition.options.tabs))
      if (tabName in tabs) tabs[tabName] = normalizeNested(tab.fields, tabs[tabName])
    return tabs
  }

  if (definition.type === 'array') {
    if (!Array.isArray(value)) return value
    return value.map(item => normalizeArrayItem(definition.options.of, item))
  }

  return value
}

function normalizeArrayItem(of: ArrayItemDefinition, item: unknown): unknown {
  if (isArrayItemFieldDefinition(of)) return normalizeField(of, item)
  return normalizeNested(of, item)
}

function normalizeNested(schema: Record<string, FieldDefinition>, value: unknown): unknown {
  if (!isRecord(value)) return value
  return normalizeEponymePhones(schema, value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
