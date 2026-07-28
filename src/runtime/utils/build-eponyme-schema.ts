import { z } from 'zod'
import type { EponymeSchema } from '../types'
import { validateEponymeData, validateEponymePatch, type ValidationErrors, type ValidationMode } from './validate-eponyme-data'

/**
 * Exposes the Eponyme rules as a standard zod schema, so the same validation runs
 * server-side on write and client-side on every keystroke.
 *
 * The rules themselves stay in `validate-eponyme-data.ts`: they carry mode-dependent
 * semantics (`required` and lower bounds only apply when publishing) and cross-field
 * context (`visibleWhen`, custom `validate`) that static zod checks cannot express.
 * This wrapper turns the resulting path-keyed errors into zod issues, which is what
 * gives consumers `issue.path` and a familiar `safeParse` API.
 */
export type EponymeZodSchema = z.ZodType<Record<string, unknown>>

const cache = new WeakMap<EponymeSchema, Partial<Record<ValidationMode, EponymeZodSchema>>>()

function toIssuePath(path: string) {
  // `items.0.title` -> ['items', 0, 'title']; numeric segments become array indices.
  return path === '_form'
    ? []
    : path.split('.').map(segment => /^\d+$/.test(segment) ? Number(segment) : segment)
}

function addErrorsToContext(errors: ValidationErrors, ctx: z.RefinementCtx) {
  for (const [path, messages] of Object.entries(errors)) {
    for (const message of messages)
      ctx.addIssue({ code: 'custom', message, path: toIssuePath(path) })
  }
}

function createSchema(schema: EponymeSchema, mode: ValidationMode): EponymeZodSchema {
  return z
    .custom<Record<string, unknown>>(value => Boolean(value) && typeof value === 'object' && !Array.isArray(value), {
      message: 'Body must be an object.',
    })
    .superRefine((value, ctx) => addErrorsToContext(validateEponymeData(schema, value, mode), ctx))
}

/** Cached per (schema, mode) pair: the client rebuilds nothing while typing. */
export function buildEponymeSchema(schema: EponymeSchema, mode: ValidationMode = 'publish'): EponymeZodSchema {
  const modes = cache.get(schema) ?? {}
  if (!modes[mode]) {
    modes[mode] = createSchema(schema, mode)
    cache.set(schema, modes)
  }
  return modes[mode]
}

/** Same shape as a patch validation, for validating a partial payload. */
export function buildEponymePatchSchema(schema: EponymeSchema, mode: ValidationMode = 'publish'): EponymeZodSchema {
  return z
    .custom<Record<string, unknown>>(value => Boolean(value) && typeof value === 'object' && !Array.isArray(value), {
      message: 'Body must be an object.',
    })
    .superRefine((value, ctx) => addErrorsToContext(validateEponymePatch(schema, value, value, mode), ctx))
}

/** Turns a zod error back into the `{ path: messages }` shape the API and the editor use. */
export function zodErrorToValidationErrors(error: z.ZodError): ValidationErrors {
  const errors = Object.create(null) as ValidationErrors
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.join('.') : '_form'
    ;(errors[path] ??= []).push(issue.message)
  }
  return errors
}

/** Convenience wrapper: parse and get errors keyed by field path. */
export function validateWithSchema(
  schema: EponymeSchema,
  data: unknown,
  mode: ValidationMode = 'publish',
): ValidationErrors {
  const result = buildEponymeSchema(schema, mode).safeParse(data)
  return result.success ? (Object.create(null) as ValidationErrors) : zodErrorToValidationErrors(result.error)
}
