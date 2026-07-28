import { useEponymeFormService } from '../services/eponyme-form-service'
import type { ValidationErrors } from '../../utils/validate-eponyme-data'

export type EponymeFormValidationResult
  = | { data: Record<string, unknown>, errors?: never }
    | { data?: never, errors: ValidationErrors }

/**
 * Auto-imported so a `custom` form keeps a server-side security boundary: client
 * validation only ever improves feedback. Throws on an unknown form name, since
 * that is a configuration mistake rather than bad user input.
 */
export function validateEponymeForm(name: string, body: unknown): EponymeFormValidationResult {
  const result = useEponymeFormService().validate(name, body)
  if (!result) throw new Error(`[Eponyme] Unknown form "${name}". Declare it with form() in eponyme.config.ts.`)
  return result
}
