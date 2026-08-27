import en from './en.json' with { type: 'json' }

/**
 * The English catalogue, and the source of truth for the keys.
 *
 * Imported rather than read from disk: `package.json` ships `files: ["dist"]`, so a
 * `readFile` against `src/locales/` works in development and fails once published. The
 * import is inlined into `dist/module.mjs` by the module build.
 *
 * Importing it also gives the keys as literal types, which is what makes `MessageKey`
 * derivable instead of generated – a derived type cannot drift from the file it derives from.
 */
export const eponymeEnglishMessages = en

export type EponymeMessageKey = keyof typeof en

/**
 * Where a locale writes plural forms, it writes three, separated by `|`: none, one, many.
 * `plural` maps a count to one of those indices.
 */
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
 * `en-GB` rather than `en`: day-first, 24-hour, and a list read as "a, b or c" without the
 * serial comma – which is what the dashboard already shows.
 */
export const EPONYME_DEFAULT_LOCALE: EponymeLocaleDefinition = {
  code: 'en-GB',
  messages: en,
}
