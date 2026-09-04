import type { PhoneFieldOptions } from '../types/field'
import { normalizePhoneWith, pendingPhone, toPhoneValueWith } from './phone-rules'
import type { NormalizedPhone, PhoneParser } from './phone-rules'

export type { NormalizedPhone } from './phone-rules'

/** The browser half of `#eponyme/phone`. */
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
