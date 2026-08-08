import { locale } from '#eponyme/locale'

/**
 * Dates in the dashboard are formatted with the interface's locale rather than the ambient one.
 *
 * `Intl.DateTimeFormat(undefined, …)` resolves to the server's locale during SSR and to the
 * visitor's in the browser, so the two renders disagree and Vue reports a hydration mismatch on
 * every timestamp. The interface language is decided once at build time, so using it here keeps
 * both renders identical and the dates consistent with the words around them.
 *
 * With no `eponyme.locale` configured this is `en-GB` — day-first and 24-hour, which reads
 * closer to what most of the world expects than `en-US`.
 */
export const EPONYME_DATE_LOCALE = locale.code
