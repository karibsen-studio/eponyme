import type { EponymeFormDefinition, EponymeFormOptions, EponymeFormSchema } from '../runtime/types'

/** Field types a visitor can meaningfully fill in on a public page. */
const PUBLIC_FIELD_TYPES = ['string', 'textarea', 'email', 'phone', 'url', 'number', 'boolean', 'select', 'radio', 'checkboxGroup'] as const

const DEFAULT_HONEYPOT = '_eponyme_hp'
const DEFAULT_MAX_BODY_BYTES = 64 * 1024
const DEFAULT_MAX_STORED_SUBMISSIONS = 10_000
const DEFAULT_RETENTION_DAYS = 365

export function form<const T extends EponymeFormSchema>(options: EponymeFormOptions<T>): EponymeFormDefinition<T> {
  for (const [name, definition] of Object.entries(options.fields)) {
    const type = (definition as { type?: string }).type
    if (!PUBLIC_FIELD_TYPES.includes(type as typeof PUBLIC_FIELD_TYPES[number]))
      throw new TypeError(`[Eponyme] Form field "${name}" uses field.${type}(), which is not available in a public form. Use one of: ${PUBLIC_FIELD_TYPES.join(', ')}.`)
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
    maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
  }
}

function positiveIntegerOrFalse(value: number | false | undefined, fallback: number, name: string): number | false {
  const resolved = value ?? fallback
  if (resolved === false) return false
  if (!Number.isSafeInteger(resolved) || resolved < 1)
    throw new TypeError(`[Eponyme] Form ${name} must be a positive integer or false.`)
  return resolved
}
