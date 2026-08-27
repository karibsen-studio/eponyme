import type { ArrayItemDefinition, ArrayItemFieldDefinition, FieldDefinition } from '../types/field'
import { getEponymeCustomFieldType } from './eponyme-custom-field'

export function isArrayItemFieldDefinition(definition: ArrayItemDefinition): definition is ArrayItemFieldDefinition {
  return 'type' in definition
}

export function getArrayItemDefaultValue(definition: ArrayItemDefinition): unknown {
  if (isArrayItemFieldDefinition(definition)) return getFieldDefaultValue(definition)

  return Object.fromEntries(
    Object.entries(definition).map(([name, field]) => [name, getFieldDefaultValue(field)]),
  )
}

export function getFieldDefaultValue(definition: FieldDefinition): unknown {
  if (definition.type === 'date' && isTodayDateDefault(definition.options.defaultValue))
    return getLocalToday()

  if (definition.options.defaultValue !== undefined)
    return cloneDefaultValue(definition.options.defaultValue)

  switch (definition.type) {
    case 'array': return []
    case 'checkboxGroup': return []
    case 'tags': return []
    // A relation holds slugs, so an empty one is an empty list or an empty string.
    case 'relation': return definition.options.multiple ? [] : ''
    case 'section': return Object.fromEntries(
      Object.entries(definition.options.fields).map(([name, field]) => [name, getFieldDefaultValue(field)]),
    )
    case 'tabs': return Object.fromEntries(
      Object.entries(definition.options.tabs).map(([tabName, tab]) => [
        tabName,
        Object.fromEntries(Object.entries(tab.fields).map(([name, field]) => [name, getFieldDefaultValue(field)])),
      ]),
    )
    case 'number':
    case 'duration': return 0
    case 'url': return { href: '', type: 'external', openInNewTab: false, download: false }
    case 'mediaPlayer': return { provider: '', url: '', id: '' }
    case 'boolean': return false
    case 'custom': return cloneDefaultValue(getEponymeCustomFieldType(definition.name).defaultValue)
    default: return ''
  }
}

function isTodayDateDefault(value: unknown): value is { __eponymeDefault: 'today' } {
  return Boolean(value && typeof value === 'object' && '__eponymeDefault' in value && value.__eponymeDefault === 'today')
}

function getLocalToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function cloneDefaultValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneDefaultValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDefaultValue(item)]))
  return value
}
