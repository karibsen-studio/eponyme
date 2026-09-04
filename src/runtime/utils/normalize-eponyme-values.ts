import type { ArrayItemDefinition, FieldDefinition } from '../types/field'
import type { EponymeSchema } from '../types'
import { isArrayItemFieldDefinition } from './get-field-default-value'
import { normalizeEponymeMediaPlayer } from './media-player'
import { toEponymePhoneValue } from '#eponyme/phone'
import { normalizeEponymeTags } from './normalize-tags'
import { sanitizeEponymeRichText } from './sanitize-rich-text'
import { normalizeEponymeDateTime } from './datetime'
import { getEponymeCustomFieldType } from './eponyme-custom-field'

/**
 * Rewrites every value that has a canonical form - a phone in E.164, a tag list deduplicated, rich text
 * reduced to the HTML the editor can produce - wherever it sits in the schema.
 */
export function normalizeEponymeValues(schema: EponymeSchema, data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data }
  for (const [name, definition] of Object.entries(schema)) {
    if (!Object.hasOwn(result, name)) continue
    result[name] = normalizeField(definition, result[name])
  }
  return result
}

/**
 * Slugs, and nothing else: blanks are dropped and a list is deduplicated, so "the same entry twice" cannot
 * be stored and then read back as two.
 */
function normalizeEponymeRelation(value: unknown, multiple: boolean | undefined): unknown {
  if (multiple) {
    if (!Array.isArray(value)) return value
    return [...new Set(value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : []))]
  }
  return typeof value === 'string' ? value.trim() : value
}

function normalizeField(definition: FieldDefinition, value: unknown): unknown {
  if (definition.type === 'custom') {
    const customField = getEponymeCustomFieldType(definition.name)
    return customField.normalize ? customField.normalize(value, definition.options) : value
  }

  if (definition.type === 'datetime' && typeof value === 'string')
    return normalizeEponymeDateTime(value) ?? value

  if (definition.type === 'richText') return typeof value === 'string' ? sanitizeEponymeRichText(value) : value

  if (definition.type === 'phone') return toEponymePhoneValue(value, definition.options)

  if (definition.type === 'tags') return Array.isArray(value) ? normalizeEponymeTags(value, definition.options) : value

  if (definition.type === 'mediaPlayer') return normalizeEponymeMediaPlayer(value, definition.options)

  if (definition.type === 'relation') return normalizeEponymeRelation(value, definition.options.multiple)

  if (definition.type === 'section')
    return normalizeNested(definition.options.fields, value)

  if (definition.type === 'tabs') {
    if (!isRecord(value)) return value
    const tabs = { ...value }
    for (const [tabName, tab] of Object.entries(definition.options.tabs))
      if (Object.hasOwn(tabs, tabName)) tabs[tabName] = normalizeNested(tab.fields, tabs[tabName])
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
  return normalizeEponymeValues(schema, value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
