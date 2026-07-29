import type { EponymeVariableDefinition, EponymeVariableValue, EponymeVariables } from '../types/variables'

/**
 * `{{ name }}` — the name is a plain identifier, never an expression. Content is
 * editable from the dashboard, so evaluating code from it would hand an editor
 * arbitrary execution on the server.
 */
const VARIABLE_PATTERN = /\{\{\s*([A-Z_]\w*)\s*\}\}/gi

/** Always available, whatever the host application configures. */
export function builtinEponymeVariables(now: Date = new Date()): Record<string, EponymeVariableDefinition> {
  return {
    currentYear: { label: 'Current year', description: 'The year at the time the page is served.', value: () => now.getFullYear() },
    nextYear: { label: 'Next year', description: 'Useful for a season spanning two years.', value: () => now.getFullYear() + 1 },
    previousYear: { label: 'Previous year', value: () => now.getFullYear() - 1 },
    currentMonth: { label: 'Current month', value: () => now.toLocaleDateString(undefined, { month: 'long' }) },
    currentDay: { label: 'Current day', value: () => String(now.getDate()) },
    today: { label: 'Today', description: 'Localised date, for example 29 July 2026.', value: () => now.toLocaleDateString(undefined, { dateStyle: 'long' }) },
    currentDate: { label: 'Today (ISO)', description: 'Machine-readable date, for example 2026-07-29.', value: () => now.toISOString().slice(0, 10) },
  }
}

function toDefinition(entry: EponymeVariableValue | EponymeVariableDefinition): EponymeVariableDefinition {
  return typeof entry === 'object' && entry !== null && 'value' in entry ? entry : { value: entry }
}

/** Host variables win, so an application can override a built-in for its own wording. */
export function resolveEponymeVariables(custom: EponymeVariables = {}, now?: Date): Record<string, string> {
  const merged: Record<string, EponymeVariableDefinition> = { ...builtinEponymeVariables(now) }
  for (const [name, entry] of Object.entries(custom)) merged[name] = toDefinition(entry)

  return Object.fromEntries(Object.entries(merged).map(([name, definition]) => {
    try {
      const value = typeof definition.value === 'function' ? definition.value() : definition.value
      return [name, String(value)]
    }
    catch {
      // A throwing variable must not take the whole page down with it.
      return [name, '']
    }
  }))
}

export function summariseEponymeVariables(custom: EponymeVariables = {}): Array<{ name: string, label: string, description?: string, preview: string }> {
  const merged: Record<string, EponymeVariableDefinition> = { ...builtinEponymeVariables() }
  for (const [name, entry] of Object.entries(custom)) merged[name] = toDefinition(entry)
  const resolved = resolveEponymeVariables(custom)

  return Object.entries(merged).map(([name, definition]) => ({
    name,
    label: definition.label ?? name,
    description: definition.description,
    preview: resolved[name] ?? '',
  }))
}

/**
 * Replaces every `{{ name }}` occurrence. An unknown name is left untouched rather
 * than blanked, so a typo shows up on the page instead of silently deleting text.
 */
export function interpolateEponymeText(text: string, variables: Record<string, string>): string {
  if (!text.includes('{{')) return text
  return text.replace(VARIABLE_PATTERN, (match, name: string) => variables[name] ?? match)
}

/** Walks strings nested in objects and arrays, leaving every other value alone. */
export function interpolateEponymeValue<T>(value: T, variables: Record<string, string>): T {
  if (typeof value === 'string') return interpolateEponymeText(value, variables) as T
  if (Array.isArray(value)) return value.map(item => interpolateEponymeValue(item, variables)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, interpolateEponymeValue(nested, variables)]),
    ) as T
  }
  return value
}
