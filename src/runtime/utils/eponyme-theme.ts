export const EPONYME_THEME_COOKIE = 'eponyme-theme'
export const EPONYME_THEME_MAX_AGE = 60 * 60 * 24 * 365

export type EponymeTheme = 'light' | 'dark'

export function isEponymeTheme(value: unknown): value is EponymeTheme {
  return value === 'light' || value === 'dark'
}

/** Runs in the document head before the dashboard is painted. */
export const EPONYME_THEME_BOOTSTRAP = `(()=>{const name="${EPONYME_THEME_COOKIE}";const match=document.cookie.match(/(?:^|;\\s*)eponyme-theme=(light|dark)(?:;|$)/);const theme=match?.[1]??(window.matchMedia?.("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.classList.remove("ep-light","ep-dark");document.documentElement.classList.add("ep-"+theme);if(!match)document.cookie=name+"="+theme+"; Path=/; Max-Age=${EPONYME_THEME_MAX_AGE}; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")})()`
