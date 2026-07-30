import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import type { PhoneFieldOptions } from '../types/field'

export interface NormalizedPhone {
  /** The number in E.164, present only when it parsed and validated. */
  e164?: string
  /** Country the number resolved to, present as soon as it parsed. */
  country?: string
  valid: boolean
  /** Set when the number is valid but its country is not in `countries`. */
  countryNotAllowed?: boolean
}

/**
 * Single source of truth for what a phone field accepts, shared by the validation the server
 * enforces, the editor field, and the write path that stores the value.
 *
 * The `min` metadata bundle is deliberate: it is a fraction of the size of the full one and
 * parses and formats every country. The trade is precision — it accepts a few numbers the full
 * metadata would reject as impossible for their region.
 *
 * @see https://gitlab.com/catamphetamine/libphonenumber-js#min-vs-max-vs-mobile-vs-core
 */
export function normalizeEponymePhone(value: unknown, options: PhoneFieldOptions = {}): NormalizedPhone {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return { valid: true }

  // Without `detectCountry`, a national number would be resolved against `defaultCountry`
  // silently. Requiring `+` keeps the country the author's decision rather than a guess.
  const international = raw.startsWith('+')
  if (options.detectCountry === false && !international) return { valid: false }

  const parsed = parsePhoneNumberFromString(raw, international ? undefined : options.defaultCountry)
  if (!parsed || !parsed.isValid()) return { valid: false, country: parsed?.country }

  const allowed = options.countries?.length ? options.countries as string[] : undefined
  if (allowed && (!parsed.country || !allowed.includes(parsed.country)))
    return { valid: false, country: parsed.country, countryNotAllowed: true }

  return { valid: true, e164: parsed.number, country: parsed.country }
}

/**
 * The value to store: E.164 whenever the number is understood, and the input untouched when it
 * is not, so validation can report it and the editor can still see what was typed.
 */
export function toEponymePhoneValue(value: unknown, options: PhoneFieldOptions = {}): unknown {
  if (typeof value !== 'string') return value
  return normalizeEponymePhone(value, options).e164 ?? value
}
