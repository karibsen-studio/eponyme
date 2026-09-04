import type { H3Event } from 'h3'
import { useEponymeFormService } from '../services/eponyme-form-service'
import type { EponymeFormSubmission } from '../services/eponyme-form-store'
import type { ValidationErrors } from '../../utils/validate-eponyme-data'
import {
  assertEponymeRateLimit,
  consumeEponymeRateLimit,
  eponymeRateLimitPolicies,
  eponymeRequestClientKey,
  refuseEponymeRateLimit,
} from './rate-limit'

export type EponymeFormValidationResult
  = | { data: Record<string, unknown>, errors?: never }
    | { data?: never, errors: ValidationErrors }

/**
 * Auto-imported so a `custom` form keeps a server-side security boundary: client validation only ever
 * improves feedback.
 */
export function validateEponymeForm(name: string, body: unknown): EponymeFormValidationResult {
  const result = useEponymeFormService().validate(name, body)
  if (!result) throw new Error(`[Eponyme] Unknown form "${name}". Declare it with form() in eponyme.config.ts.`)
  return result
}

/** Applies the limits a managed form gets, to a route Eponyme does not own. */
export async function assertEponymeFormRateLimit(event: H3Event, name: string): Promise<void> {
  const service = useEponymeFormService()
  if (!service.getForm(name))
    throw new Error(`[Eponyme] Unknown form "${name}". Declare it with form() in eponyme.config.ts.`)

  const limits = eponymeRateLimitPolicies()
  const client = eponymeRequestClientKey(event)
  await assertEponymeRateLimit(event, `form:${name}:ip:${client}`, limits.formIp)

  // A full global window must not turn the form off for everyone: an address that has not used its reserve
  // still gets through.
  const global = await consumeEponymeRateLimit(`form:${name}:global`, limits.formGlobal)
  if (global.allowed) return
  const reserve = await consumeEponymeRateLimit(`form:${name}:reserve:${client}`, limits.formReserve)
  if (!reserve.allowed) refuseEponymeRateLimit(event, global)
}

export type EponymeFormStoreResult
  = | { submission: EponymeFormSubmission, errors?: never }
    | { submission?: never, errors: ValidationErrors }

/**
 * Stores a submission from a route Eponyme does not own, so the dashboard collects what a `custom` form, a
 * webhook or an import produced.
 */
export async function storeEponymeFormSubmission(name: string, data: unknown): Promise<EponymeFormStoreResult> {
  const service = useEponymeFormService()
  if (!service.getForm(name))
    throw new Error(`[Eponyme] Unknown form "${name}". Declare it with form() in eponyme.config.ts.`)

  const result = await service.store(name, data)
  if (!result)
    throw new Error(`[Eponyme] Form "${name}" does not store submissions. Add submission: { store: true } to collect them in the dashboard.`)
  return 'errors' in result ? { errors: result.errors } : { submission: result.submission }
}
