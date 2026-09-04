import { setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/** A CDN may keep serving a stale answer for this multiple of its own window while it refreshes. */
const STALE_WHILE_REVALIDATE_FACTOR = 12

/** Re-exported so server code keeps one import for everything cache-related. */
export { getEponymeCacheTags } from '../../utils/cache-tags'

function setCacheTags(event: H3Event, tags: string[]) {
  if (!tags.length) return
  const value = tags.join(',')
  // Vercel reads its own header; `Cache-Tag` is what Cloudflare and Fastly-style CDNs read.
  setResponseHeader(event, 'Vercel-Cache-Tag', value)
  setResponseHeader(event, 'Cache-Tag', value)
}

/** Published content is identical for every visitor, so both the browser and the CDN may hold on to it. */
export function setEponymePublicCache(event: H3Event, tags: string[] = []) {
  const config = useRuntimeConfig().eponymeContent
  const browser = Math.max(0, Math.trunc(config.browserCacheSeconds))
  const cdn = Math.max(0, Math.trunc(config.cdnCacheSeconds))
  if (!browser && !cdn) {
    setResponseHeader(event, 'Cache-Control', 'no-cache')
    return
  }
  setResponseHeader(
    event,
    'Cache-Control',
    `public, max-age=${browser}, s-maxage=${cdn}, stale-while-revalidate=${cdn * STALE_WHILE_REVALIDATE_FACTOR}`,
  )
  setCacheTags(event, tags)
}

/** Drafts and historical versions are unreleased material. */
export function setEponymePrivateCache(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}
