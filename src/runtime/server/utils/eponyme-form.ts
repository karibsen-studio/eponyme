import type { H3Event } from 'h3'
import { useEponymeFormService } from '../services/eponyme-form-service'
import type { EponymeFormSubmission } from '../services/eponyme-form-store'
import type { ValidationErrors } from '../../utils/validate-eponyme-data'
import { assertEponymeRateLimit, eponymeRateLimitPolicies, eponymeRequestClientKey } from './rate-limit'

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

/**
 * Applies the same two limits a managed form gets, to a route Eponyme does not own.
 *
 * Auto-imported because a `custom` form bypasses the module's endpoint entirely, and with it
 * every limit that endpoint applies. Nothing can add them on the host's behalf – the route is
 * theirs – so the least Eponyme can do is make them one line rather than a reimplementation.
 *
 * Call it before reading the body: a limit that runs after parsing has already paid for the
 * request it was meant to refuse. Throws a `429` carrying `Retry-After`, so an unguarded
 * `await` is enough and there is no result to check.
 *
 * The form must be declared in `eponyme.config.ts`. A name that matches nothing is a typo
 * rather than bad input, and left alone it would silently count into a bucket the configured
 * limits never reach.
 */
export async function assertEponymeFormRateLimit(event: H3Event, name: string): Promise<void> {
  const service = useEponymeFormService()
  if (!service.getForm(name))
    throw new Error(`[Eponyme] Unknown form "${name}". Declare it with form() in eponyme.config.ts.`)

  const limits = eponymeRateLimitPolicies()
  await assertEponymeRateLimit(event, `form:${name}:ip:${eponymeRequestClientKey(event)}`, limits.formIp)
  await assertEponymeRateLimit(event, `form:${name}:global`, limits.formGlobal)
}

export type EponymeFormStoreResult
  = | { submission: EponymeFormSubmission, errors?: never }
    | { submission?: never, errors: ValidationErrors }

/**
 * Stores a submission from a route Eponyme does not own, so the dashboard collects what
 * a `custom` form, a webhook or an import produced. Validates again on the way in: the
 * caller may have built the payload itself rather than read it from a request.
 *
 * Throws when the form does not declare `submission: { store: true }`, since a silent
 * no-op would look like a submission that arrived and then vanished.
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
