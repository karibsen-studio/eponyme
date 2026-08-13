import type { EponymeCollectionDefinitionBase, EponymeConfig, EponymeFormDefinitionBase, EponymeSchema, FieldDefinition } from '../types'

export function isEponymeCollection(value: unknown): value is EponymeCollectionDefinitionBase {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Partial<EponymeCollectionDefinitionBase>).__eponymeCollection === true)
}

export function isEponymeForm(value: unknown): value is EponymeFormDefinitionBase {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Partial<EponymeFormDefinitionBase>).__eponymeForm === true)
}

export function isEponymeSchema(value: EponymeSchema | EponymeCollectionDefinitionBase | EponymeFormDefinitionBase | EponymeConfig): value is EponymeSchema {
  if (isEponymeCollection(value) || isEponymeForm(value)) return false
  return Object.values(value).every(field => typeof field === 'object' && field !== null && 'type' in field && typeof (field as FieldDefinition).type === 'string')
}

export function getEponymeSchemas(config: EponymeConfig, prefix = ''): Record<string, EponymeSchema> {
  return registryFromEntries(Object.entries(config).flatMap(([name, value]) => {
    const path = prefix ? `${prefix}/${name}` : name
    if (isEponymeCollection(value) || isEponymeForm(value)) return []
    return isEponymeSchema(value) ? [[path, value]] : Object.entries(getEponymeSchemas(value, path))
  }))
}

export function getEponymeCollections(config: EponymeConfig, prefix = ''): Record<string, EponymeCollectionDefinitionBase> {
  return registryFromEntries(Object.entries(config).flatMap(([name, value]) => {
    const path = prefix ? `${prefix}/${name}` : name
    if (isEponymeCollection(value)) return [[path, value]]
    if (isEponymeForm(value)) return []
    return isEponymeSchema(value) ? [] : Object.entries(getEponymeCollections(value, path))
  }))
}

export function getEponymeForms(config: EponymeConfig, prefix = ''): Record<string, EponymeFormDefinitionBase> {
  return registryFromEntries(Object.entries(config).flatMap(([name, value]) => {
    const path = prefix ? `${prefix}/${name}` : name
    if (isEponymeForm(value)) return [[path, value]]
    if (isEponymeCollection(value)) return []
    return isEponymeSchema(value) ? [] : Object.entries(getEponymeForms(value, path))
  }))
}

/** Route-facing registries must never resolve inherited names such as `constructor`. */
function registryFromEntries<T>(entries: Array<[string, T]>): Record<string, T> {
  const registry = Object.create(null) as Record<string, T>
  for (const [name, value] of entries) registry[name] = value
  return registry
}
