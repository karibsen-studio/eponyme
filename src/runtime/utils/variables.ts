import type { EponymeSchema } from '../types'
import type { EponymeVariableDefinition, EponymeVariableValue, EponymeVariables } from '../types/variables'
import { mapEponymeRichText } from './rich-text-fields'

/**
 * `{{ name }}` — the name is a plain identifier, never an expression. Content is
 * editable from the dashboard, so evaluating code from it would hand an editor
 * arbitrary execution on the server.
 */
const VARIABLE_PATTERN_SOURCE = String.raw`\{\{\s*([A-Z_]\w*)\s*\}\}`
const VARIABLE_PATTERN = new RegExp(VARIABLE_PATTERN_SOURCE, 'gi')

export function findEponymeVariableRanges(text: string): Array<{ from: number, to: number }> {
  return [...text.matchAll(new RegExp(VARIABLE_PATTERN_SOURCE, 'gi'))].map(match => ({
    from: match.index,
    to: match.index + match[0].length,
  }))
}

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

/**
 * Same substitution, but a variable landing inside rich text is HTML-escaped first.
 *
 * A variable's value is a string, not markup — and a host may well compute it from data it
 * does not control. Substituted raw into stored HTML it would be parsed as markup, which is
 * exactly the hole the write-time sanitisation closes everywhere else.
 *
 * Rich text is resolved first so the general pass below, which knows nothing of HTML, finds
 * no `{{ name }}` left to replace there.
 */
export function interpolateEponymeEntryData<T>(schema: EponymeSchema | undefined, data: T, variables: Record<string, string>): T {
  if (!schema || !data || typeof data !== 'object' || Array.isArray(data)) return interpolateEponymeValue(data, variables)
  const escaped = Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, escapeHtml(value)]))
  const resolved = mapEponymeRichText(schema, data as Record<string, unknown>, html => interpolateEponymeText(html, escaped))
  return interpolateEponymeValue(resolved, variables) as T
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Walks strings nested in objects and arrays, leaving every other value alone.
 *
 * A branch containing no `{{ name }}` is returned as-is rather than rebuilt, so content
 * without variables — which is most of it — costs no copy. The result therefore shares
 * structure with its input and must be treated as read-only, which is already true of
 * everything the read routes return.
 */
export function interpolateEponymeValue<T>(value: T, variables: Record<string, string>): T {
  if (typeof value === 'string') return interpolateEponymeText(value, variables) as T
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const interpolated = interpolateEponymeValue(item, variables)
      if (interpolated !== item) changed = true
      return interpolated
    })
    return (changed ? next : value) as T
  }
  if (value && typeof value === 'object') {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const interpolated = interpolateEponymeValue(nested, variables)
      if (interpolated !== nested) changed = true
      next[key] = interpolated
    }
    return (changed ? next : value) as T
  }
  return value
}
