import { setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/** A CDN may keep serving a stale answer for this multiple of its own window while it refreshes. */
const STALE_WHILE_REVALIDATE_FACTOR = 12

/**
 * Published content is identical for every visitor, so both the browser and the CDN may
 * hold on to it. The two windows are deliberately different:
 *
 * - `s-maxage` is the CDN's, and a CDN can be purged — `eponyme:entry:published` is the
 *   hook to do it from, so this one can afford to be long.
 * - `max-age` is the browser's, and a browser cache cannot be purged by anyone. Whatever
 *   it holds is served until it expires, publication or not, which is why it stays short.
 */
export function setEponymePublicCache(event: H3Event) {
  const config = useRuntimeConfig().eponymeContent as { browserCacheSeconds?: number, cdnCacheSeconds?: number } | undefined
  const browser = Math.max(0, Math.trunc(config?.browserCacheSeconds ?? 30))
  const cdn = Math.max(0, Math.trunc(config?.cdnCacheSeconds ?? 300))
  if (!browser && !cdn) {
    setResponseHeader(event, 'Cache-Control', 'no-cache')
    return
  }
  setResponseHeader(
    event,
    'Cache-Control',
    `public, max-age=${browser}, s-maxage=${cdn}, stale-while-revalidate=${cdn * STALE_WHILE_REVALIDATE_FACTOR}`,
  )
}

/**
 * Drafts and historical versions are unreleased material. `no-store` rather than
 * `no-cache`: nothing may keep a copy at all, not even one it promises to revalidate.
 */
export function setEponymePrivateCache(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}
