import type { EponymeSchema } from '../types'
import type { ArrayItemDefinition, FieldDefinition } from '../types/field'
import { isArrayItemFieldDefinition } from './get-field-default-value'

/**
 * Applies `map` to every `field.richText()` value of an entry, wherever the schema puts it - inside a
 * section, a tab, an array of items or an array of rich text.
 */
export function mapEponymeRichText(
  schema: EponymeSchema,
  data: Record<string, unknown>,
  map: (html: string, path: string) => string,
): Record<string, unknown> {
  return walkSchema(schema, data, '', map) as Record<string, unknown>
}

function walkSchema(schema: EponymeSchema, data: unknown, prefix: string, map: (html: string, path: string) => string): unknown {
  if (!isRecord(data)) return data
  let changed = false
  const next: Record<string, unknown> = { ...data }
  for (const [name, definition] of Object.entries(schema)) {
    if (!(name in data)) continue
    const value = walkField(definition, data[name], prefix ? `${prefix}.${name}` : name, map)
    if (value !== data[name]) changed = true
    next[name] = value
  }
  return changed ? next : data
}

function walkField(definition: FieldDefinition, value: unknown, path: string, map: (html: string, path: string) => string): unknown {
  if (definition.type === 'richText') return typeof value === 'string' ? map(value, path) : value

  if (definition.type === 'section') return walkSchema(definition.options.fields, value, path, map)

  if (definition.type === 'tabs') {
    if (!isRecord(value)) return value
    let changed = false
    const tabs: Record<string, unknown> = { ...value }
    for (const [tabName, tab] of Object.entries(definition.options.tabs)) {
      const next = walkSchema(tab.fields, value[tabName], `${path}.${tabName}`, map)
      if (next !== value[tabName]) changed = true
      tabs[tabName] = next
    }
    return changed ? tabs : value
  }

  if (definition.type === 'array') {
    if (!Array.isArray(value)) return value
    let changed = false
    const items = value.map((item, index) => {
      const next = walkArrayItem(definition.options.of, item, `${path}.${index}`, map)
      if (next !== item) changed = true
      return next
    })
    return changed ? items : value
  }

  return value
}

function walkArrayItem(of: ArrayItemDefinition, item: unknown, path: string, map: (html: string, path: string) => string): unknown {
  return isArrayItemFieldDefinition(of) ? walkField(of, item, path, map) : walkSchema(of, item, path, map)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
