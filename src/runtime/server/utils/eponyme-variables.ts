import eponymeVariables from '#eponyme/variables'
import type { EponymeSchema } from '../../types'
import type { EponymeVariables } from '../../types/variables'
import { interpolateEponymeEntryData, interpolateEponymeValue, resolveEponymeVariables } from '../../utils/variables'

/**
 * Resolved per call rather than cached: a variable such as `currentYear` has to reflect the moment the page
 * is served, not the moment the server booted.
 */
export function interpolateEponymeContent<T>(value: T): T {
  return interpolateEponymeValue(value, resolveEponymeVariables(eponymeVariables as EponymeVariables))
}

/** Same, with the entry's schema, so a variable cannot reopen the HTML of a rich text field. */
export function interpolateEponymeEntry<T>(schema: EponymeSchema | undefined, data: T): T {
  return interpolateEponymeEntryData(schema, data, resolveEponymeVariables(eponymeVariables as EponymeVariables))
}
