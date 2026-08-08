import { EPONYME_DEFAULT_LOCALE, eponymeEnglishMessages, type EponymeLocaleDefinition } from './runtime/locales'

export interface ResolvedEponymeLocale extends EponymeLocaleDefinition {
  /** Keys the catalogue does not carry, which therefore read in English. */
  missing: string[]
}

/**
 * Merges a configured catalogue over English.
 *
 * The merge is what makes a partial catalogue usable: a key the locale does not carry reads in
 * English rather than showing its own name to an editor. `missing` is what stops that from being
 * silent — it is the price of keeping translations in a package released on its own schedule.
 *
 * Throws rather than warns on a malformed option: a locale that is not a locale means the
 * dashboard is in a language nobody chose, and the build is the right place to notice.
 */
export function resolveEponymeLocale(locale: unknown, prefix = '[Eponyme]'): ResolvedEponymeLocale {
  if (locale === undefined || locale === null) return { ...EPONYME_DEFAULT_LOCALE, missing: [] }

  if (typeof locale === 'function') {
    throw new TypeError(
      `${prefix} eponyme.locale expects the result of a call, not the function itself.\n`
      + `Write \`locale: fr()\` rather than \`locale: fr\`.`,
    )
  }

  const candidate = locale as Partial<EponymeLocaleDefinition>
  if (typeof locale !== 'object' || typeof candidate.code !== 'string' || !candidate.code || typeof candidate.messages !== 'object' || !candidate.messages) {
    throw new TypeError(
      `${prefix} eponyme.locale must be a locale definition carrying a \`code\` and \`messages\`.\n`
      + `Import one from @eponyme/locale, for example \`import { fr } from '@eponyme/locale/fr'\`.`,
    )
  }

  const messages = candidate.messages
  return {
    ...(candidate as EponymeLocaleDefinition),
    messages: { ...eponymeEnglishMessages, ...messages },
    missing: Object.keys(eponymeEnglishMessages).filter(key => !(key in messages)),
  }
}

/**
 * The generated `#eponyme/locale` module.
 *
 * Only the catalogue and the plural rule are serialised; the lookup itself is imported from the
 * runtime, so it stays lint-covered and testable instead of living inside a string. A locale's
 * `plural` is inlined with `Function.prototype.toString()`, which is why it has to stand alone —
 * a closure over anything outside it does not survive the crossing.
 */
export function renderEponymeLocaleModule(locale: ResolvedEponymeLocale, translatorPath: string): string {
  return [
    `import { createEponymeTranslator } from ${JSON.stringify(translatorPath)}`,
    `export const locale = ${JSON.stringify({ code: locale.code, dir: locale.dir ?? 'ltr' })}`,
    `const messages = ${JSON.stringify(locale.messages, null, 2)}`,
    `export const t = createEponymeTranslator(messages${locale.plural ? `, ${locale.plural.toString()}` : ''})`,
    '',
  ].join('\n')
}
