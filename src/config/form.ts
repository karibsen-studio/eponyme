import type { EponymeFormDefinition, EponymeFormOptions, EponymeFormSchema } from '../runtime/types'

/** Field types a visitor can meaningfully fill in on a public page. */
const PUBLIC_FIELD_TYPES = ['string', 'textarea', 'email', 'url', 'number', 'boolean', 'select', 'radio', 'checkboxGroup'] as const

const DEFAULT_HONEYPOT = '_eponyme_hp'
const DEFAULT_MAX_BODY_BYTES = 64 * 1024

export function form<const T extends EponymeFormSchema>(options: EponymeFormOptions<T>): EponymeFormDefinition<T> {
  for (const [name, definition] of Object.entries(options.fields)) {
    const type = (definition as { type?: string }).type
    if (!PUBLIC_FIELD_TYPES.includes(type as typeof PUBLIC_FIELD_TYPES[number]))
      throw new TypeError(`[Eponyme] Form field "${name}" uses field.${type}(), which is not available in a public form. Use one of: ${PUBLIC_FIELD_TYPES.join(', ')}.`)
  }

  const honeypot = options.honeypot === undefined ? DEFAULT_HONEYPOT : options.honeypot
  if (honeypot && honeypot in options.fields)
    throw new TypeError(`[Eponyme] Form honeypot "${honeypot}" collides with a declared field. Rename the field or set another honeypot.`)

  return {
    __eponymeForm: true,
    label: options.label,
    description: options.description,
    fields: options.fields,
    // Storing a submission has to be an explicit decision, so `custom` is the default.
    submission: { mode: options.submission?.mode ?? 'custom' },
    honeypot,
    maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
  }
}
