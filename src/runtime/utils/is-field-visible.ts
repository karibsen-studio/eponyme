import type { DefaultFieldOptions, FieldVisibilityCondition } from '../types'

function getValue(data: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, segment) => {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)[segment]
      : undefined
  }, data)
}

function matches(condition: FieldVisibilityCondition, data: Record<string, unknown>) {
  const value = getValue(data, condition.field)
  return 'equals' in condition ? value === condition.equals : value !== condition.notEquals
}

export function isFieldVisible(
  options: Pick<DefaultFieldOptions<unknown>, 'visibleWhen'>,
  data: Record<string, unknown>,
) {
  if (!options.visibleWhen) return true
  const conditions = Array.isArray(options.visibleWhen) ? options.visibleWhen : [options.visibleWhen]
  return conditions.every(condition => matches(condition, data))
}
