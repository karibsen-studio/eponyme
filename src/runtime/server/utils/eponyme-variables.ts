import eponymeVariables from '#eponyme/variables'
import type { EponymeVariables } from '../../types/variables'
import { interpolateEponymeValue, resolveEponymeVariables } from '../../utils/variables'

/**
 * Resolved per call rather than cached: a variable such as `currentYear` has to
 * reflect the moment the page is served, not the moment the server booted.
 */
export function interpolateEponymeContent<T>(value: T): T {
  return interpolateEponymeValue(value, resolveEponymeVariables(eponymeVariables as EponymeVariables))
}
