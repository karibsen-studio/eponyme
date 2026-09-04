import { createHash, timingSafeEqual } from 'node:crypto'
import { setResponseHeader } from 'h3'
import type { H3Event } from 'h3'

/** Headers every route Eponyme owns carries, the dashboard included. */
const EPONYME_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': 'frame-ancestors \'none\'',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
}

/** The dashboard itself and everything under it, `/login` and `/media` included. */
export function isEponymeDashboardPath(pathname: string, dashboardPath: string): boolean {
  if (!dashboardPath || dashboardPath === '/') return false
  return pathname === dashboardPath || pathname.startsWith(`${dashboardPath}/`)
}

export function setEponymeSecurityHeaders(event: H3Event) {
  for (const [name, value] of Object.entries(EPONYME_SECURITY_HEADERS)) setResponseHeader(event, name, value)
}

/** Hashed first so both sides are the same length: `timingSafeEqual` throws otherwise. */
export function eponymeSecretMatches(candidate: string, secret: string): boolean {
  if (!candidate || !secret) return false
  return timingSafeEqual(digest(candidate), digest(secret))
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}
