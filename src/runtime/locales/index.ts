import en from './en.json' with { type: 'json' }

/** The English catalogue, and the source of truth for the keys. */
export const eponymeEnglishMessages = en

export type EponymeMessageKey = keyof typeof en

/** Where a locale writes plural forms, it writes three, separated by `|`: none, one, many. */
export interface EponymeLocaleDefinition {
  /** BCP 47, handed to `Intl` for dates, numbers and lists. */
  code: string
  /** Flat catalogue, already resolved. */
  messages: Record<string, string>
  /**
   * Must be self-contained: it is serialised into the generated catalogue with
   * `Function.prototype.toString()`, so a closure over anything outside it will not survive.
   */
  plural?: (count: number) => number
  dir?: 'ltr' | 'rtl'
}

/**
 * `en-GB` rather than `en`: day-first, 24-hour, and a list read as "a, b or c" without the serial comma -
 * which is what the dashboard already shows.
 */
export const EPONYME_DEFAULT_LOCALE: EponymeLocaleDefinition = {
  code: 'en-GB',
  messages: en,
}
