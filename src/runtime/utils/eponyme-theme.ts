export const EPONYME_THEME_COOKIE = 'eponyme-theme'
export const EPONYME_THEME_MAX_AGE = 60 * 60 * 24 * 365

export type EponymeTheme = 'light' | 'dark'

export function isEponymeTheme(value: unknown): value is EponymeTheme {
  return value === 'light' || value === 'dark'
}

export function normalizeEponymeDashboardPath(path: string): string {
  return `/${path.replace(/^\/+|\/+$/g, '')}`
}

export function isEponymeDashboardRoute(path: string, dashboardPath: string): boolean {
  const basePath = normalizeEponymeDashboardPath(dashboardPath)
  return path === basePath || path.startsWith(`${basePath}/`)
}

/** Runs in the document head before the dashboard is painted. */
export function createEponymeThemeBootstrap(dashboardPath: string): string {
  const basePath = JSON.stringify(normalizeEponymeDashboardPath(dashboardPath))
  return `(()=>{const root=document.documentElement;root.classList.remove("ep-light","ep-dark");const base=${basePath};if(location.pathname!==base&&!location.pathname.startsWith(base+"/"))return;const name="${EPONYME_THEME_COOKIE}";const match=document.cookie.match(/(?:^|;\\s*)eponyme-theme=(light|dark)(?:;|$)/);const theme=match?.[1]??(window.matchMedia?.("(prefers-color-scheme: light)").matches?"light":"dark");root.classList.add("ep-"+theme);if(!match)document.cookie=name+"="+theme+"; Path=/; Max-Age=${EPONYME_THEME_MAX_AGE}; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")})()`
}
