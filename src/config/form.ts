import type { EponymeFormDefinition, EponymeFormOptions, EponymeFormSchema } from '../runtime/types'
import { eponymeConfigInteger } from './numbers'

/** Field types a visitor can meaningfully fill in on a public page. */
const PUBLIC_FIELD_TYPES = ['string', 'textarea', 'email', 'phone', 'url', 'number', 'boolean', 'select', 'radio', 'checkboxGroup'] as const

const DEFAULT_HONEYPOT = '_eponyme_hp'
const DEFAULT_MAX_BODY_BYTES = 64 * 1024
/** A public form takes text, so a body larger than this is an error in the configuration, not a payload. */
const MAX_BODY_BYTES_CEILING = 8 * 1024 * 1024
const DEFAULT_MAX_STORED_SUBMISSIONS = 10_000
const DEFAULT_RETENTION_DAYS = 365

export function form<const T extends EponymeFormSchema>(options: EponymeFormOptions<T>): EponymeFormDefinition<T> {
  for (const [name, definition] of Object.entries(options.fields)) {
    const type = (definition as { type?: string }).type
    if (!PUBLIC_FIELD_TYPES.includes(type as typeof PUBLIC_FIELD_TYPES[number]))
      throw new TypeError(`[Eponyme] Form field "${name}" uses field.${type}(), which is not available in a public form. Use one of: ${PUBLIC_FIELD_TYPES.join(', ')}.`)

    // A visitor chooses the string a pattern runs on, and an expression that backtracks turns a long one
    // into seconds of CPU. A declared maximum is what keeps that string short.
    const fieldOptions = (definition as { options?: { regex?: RegExp, maxLength?: number } }).options
    if (fieldOptions?.regex && fieldOptions.maxLength === undefined)
      throw new TypeError(`[Eponyme] Form field "${name}" declares a regex without a maxLength. A public field validated by a pattern must bound its input.`)
  }

  const mode = options.submission?.mode ?? 'custom'
  const maxStored = positiveIntegerOrFalse(options.submission?.maxStored, DEFAULT_MAX_STORED_SUBMISSIONS, 'submission.maxStored')
  const retentionDays = positiveIntegerOrFalse(options.submission?.retentionDays, DEFAULT_RETENTION_DAYS, 'submission.retentionDays')

  const honeypot = options.honeypot === undefined ? DEFAULT_HONEYPOT : options.honeypot
  if (honeypot && Object.hasOwn(options.fields, honeypot))
    throw new TypeError(`[Eponyme] Form honeypot "${honeypot}" collides with a declared field. Rename the field or set another honeypot.`)

  return {
    __eponymeForm: true,
    label: options.label,
    description: options.description,
    fields: options.fields,
    // Storing a submission has to be an explicit decision, so `custom` is the default.
    submission: {
      mode,
      store: mode === 'managed' || (options.submission?.store ?? false),
      maxStored,
      retentionDays,
    },
    honeypot,
    maxBodyBytes: eponymeConfigInteger('Form maxBodyBytes', options.maxBodyBytes, { fallback: DEFAULT_MAX_BODY_BYTES, max: MAX_BODY_BYTES_CEILING }),
  }
}

function positiveIntegerOrFalse(value: number | false | undefined, fallback: number, name: string): number | false {
  const resolved = value ?? fallback
  if (resolved === false) return false
  if (!Number.isSafeInteger(resolved) || resolved < 1)
    throw new TypeError(`[Eponyme] Form ${name} must be a positive integer or false.`)
  return resolved
}
