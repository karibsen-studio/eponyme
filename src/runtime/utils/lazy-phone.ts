import type { PhoneFieldOptions } from '../types/field'
import { normalizePhoneWith, pendingPhone, toPhoneValueWith } from './phone-rules'
import type { NormalizedPhone, PhoneParser } from './phone-rules'

export type { NormalizedPhone } from './phone-rules'

/**
 * The browser half of `#eponyme/phone`. The metadata is around 30 kB gzipped, which every page
 * carrying an Eponyme form used to download whether or not it had a phone field in it.
 *
 * Nothing calls in here unless a schema actually holds a `field.phone()`, so the fetch starts on
 * the first phone value seen and a site without one never pays for it. Until it lands the answer
 * is `pending`, which the validator reports as no error rather than a wrong one: the field awaits
 * the parser before drawing its own state, and the API validates again on write.
 */
let parse: PhoneParser | undefined
let loading: Promise<void> | undefined

export function ensureEponymePhoneParser(): Promise<void> {
  loading ??= import('libphonenumber-js/min').then((module) => {
    parse = module.parsePhoneNumberFromString as PhoneParser
  })
  return loading
}

export function normalizeEponymePhone(value: unknown, options: PhoneFieldOptions = {}): NormalizedPhone {
  if (!parse) {
    void ensureEponymePhoneParser()
    return pendingPhone(value)
  }
  return normalizePhoneWith(parse, value, options)
}

export function toEponymePhoneValue(value: unknown, options: PhoneFieldOptions = {}): unknown {
  if (!parse) {
    void ensureEponymePhoneParser()
    return value
  }
  return toPhoneValueWith(parse, value, options)
}
