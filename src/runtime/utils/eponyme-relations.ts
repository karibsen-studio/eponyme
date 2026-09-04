import type { EponymeSchema } from '../types'
import type { ArrayItemDefinition, FieldDefinition } from '../types/field'
import { isArrayItemFieldDefinition } from './get-field-default-value'

export interface EponymeRelationReference {
  /** Dotted path of the field holding it, so an error can name where the reference is. */
  path: string
  /** Collection the field points at, as declared in `to`. */
  collection: string
  slug: string
  /** `<collection>/<slug>`, which is how an entry is keyed everywhere else. */
  entryName: string
}

/**
 * Every entry a payload points at, wherever the schema puts the relation - at the root, in a section, in a
 * tab, in an array of items or in an array of relations.
 */
export function collectEponymeRelations(schema: EponymeSchema, data: unknown): EponymeRelationReference[] {
  const references: EponymeRelationReference[] = []
  walkSchema(schema, data, '', references)
  return references
}

function walkSchema(schema: EponymeSchema, data: unknown, prefix: string, references: EponymeRelationReference[]) {
  if (!isRecord(data)) return
  for (const [name, definition] of Object.entries(schema))
    walkField(definition, data[name], prefix ? `${prefix}.${name}` : name, references)
}

function walkField(definition: FieldDefinition, value: unknown, path: string, references: EponymeRelationReference[]) {
  if (definition.type === 'relation') {
    const slugs = definition.options.multiple
      ? (Array.isArray(value) ? value : [])
      : [value]
    for (const slug of slugs) {
      if (typeof slug !== 'string' || !slug.trim()) continue
      references.push({
        path,
        collection: definition.options.to,
        slug: slug.trim(),
        entryName: `${definition.options.to}/${slug.trim()}`,
      })
    }
    return
  }

  if (definition.type === 'section') {
    walkSchema(definition.options.fields, value, path, references)
    return
  }

  if (definition.type === 'tabs') {
    if (!isRecord(value)) return
    for (const [tabName, tab] of Object.entries(definition.options.tabs))
      walkSchema(tab.fields, value[tabName], `${path}.${tabName}`, references)
    return
  }

  if (definition.type === 'array') {
    if (!Array.isArray(value)) return
    value.forEach((item, index) => walkArrayItem(definition.options.of, item, `${path}.${index}`, references))
  }
}

function walkArrayItem(of: ArrayItemDefinition, item: unknown, path: string, references: EponymeRelationReference[]) {
  if (isArrayItemFieldDefinition(of)) walkField(of, item, path, references)
  else walkSchema(of, item, path, references)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
