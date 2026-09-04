import type { PhoneFieldOptions } from '../types/field'

/** What `libphonenumber-js` gives back, narrowed to the two calls the rules below need. */
export interface ParsedPhoneNumber {
  number: string
  country?: string
  isValid: () => boolean
}

export type PhoneParser = (value: string, defaultCountry?: string) => ParsedPhoneNumber | undefined

export interface NormalizedPhone {
  /** The number in E.164, present only when it parsed and validated. */
  e164?: string
  /** Country the number resolved to, present as soon as it parsed. */
  country?: string
  valid: boolean
  /** Set when the number is valid but its country is not in `countries`. */
  countryNotAllowed?: boolean
  /** Set when the parser was not loaded yet, so `valid` is a guess rather than an answer. */
  pending?: boolean
}

/** What a phone field accepts, with the parser handed in rather than imported. */
export function normalizePhoneWith(
  parse: PhoneParser,
  value: unknown,
  options: PhoneFieldOptions = {},
): NormalizedPhone {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return { valid: true }

  // Without `detectCountry`, a national number would be resolved against `defaultCountry` silently.
  const international = raw.startsWith('+')
  if (options.detectCountry === false && !international) return { valid: false }

  const parsed = parse(raw, international ? undefined : options.defaultCountry)
  if (!parsed || !parsed.isValid()) return { valid: false, country: parsed?.country }

  const allowed = options.countries?.length ? options.countries as string[] : undefined
  if (allowed && (!parsed.country || !allowed.includes(parsed.country)))
    return { valid: false, country: parsed.country, countryNotAllowed: true }

  return { valid: true, e164: parsed.number, country: parsed.country }
}

/**
 * The value to store: E.164 whenever the number is understood, and the input untouched when it is not, so
 * validation can report it and the editor can still see what was typed.
 */
export function toPhoneValueWith(
  parse: PhoneParser,
  value: unknown,
  options: PhoneFieldOptions = {},
): unknown {
  if (typeof value !== 'string') return value
  return normalizePhoneWith(parse, value, options).e164 ?? value
}

/** Says nothing rather than the wrong thing, for the moment before the parser has arrived. */
export function pendingPhone(value: unknown): NormalizedPhone {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw ? { valid: true, pending: true } : { valid: true }
}
