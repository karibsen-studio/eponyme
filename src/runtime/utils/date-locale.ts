/**
 * Dates in the dashboard are formatted with a fixed locale rather than the ambient one.
 *
 * `Intl.DateTimeFormat(undefined, …)` resolves to the server's locale during SSR and to
 * the visitor's in the browser, so the two renders disagree and Vue reports a hydration
 * mismatch on every timestamp. The dashboard interface is English throughout, so pinning
 * the locale keeps the formatting consistent with the rest of it. `en-GB` is day-first
 * and 24-hour, which reads closer to what most of the world expects than `en-US`.
 */
export const EPONYME_DATE_LOCALE = 'en-GB'
