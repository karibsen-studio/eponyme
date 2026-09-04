import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import type { PhoneFieldOptions } from '../types/field'
import { normalizePhoneWith, toPhoneValueWith } from './phone-rules'
import type { NormalizedPhone, PhoneParser } from './phone-rules'

export type { NormalizedPhone } from './phone-rules'

/**
 * The eager half of `#eponyme/phone`, and what Nitro resolves it to: the API is the authority on what gets
 * stored, so it never validates a number without the metadata in hand.
 *
 * @see https://gitlab.com/catamphetamine/libphonenumber-js#min-vs-max-vs-mobile-vs-core
 */
const parse = parsePhoneNumberFromString as PhoneParser

export function normalizeEponymePhone(value: unknown, options: PhoneFieldOptions = {}): NormalizedPhone {
  return normalizePhoneWith(parse, value, options)
}

export function toEponymePhoneValue(value: unknown, options: PhoneFieldOptions = {}): unknown {
  return toPhoneValueWith(parse, value, options)
}

/** Already loaded here. Present so both halves of the alias offer the same thing. */
export async function ensureEponymePhoneParser(): Promise<void> {}
