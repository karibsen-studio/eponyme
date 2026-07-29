import eponymeVariables from '#eponyme/variables'
import type { EponymeVariables, EponymeVariableSummary } from '../types/variables'
import { summariseEponymeVariables } from '../utils/variables'

/** Variables an editor can insert with `{{ name }}`, for listing them in the editor. */
export function useEponymeVariables(): EponymeVariableSummary[] {
  return summariseEponymeVariables(eponymeVariables as EponymeVariables)
}
