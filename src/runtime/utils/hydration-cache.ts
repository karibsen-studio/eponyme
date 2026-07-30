import type { NuxtApp } from '#app'

/**
 * `getCachedData` for reads that must never serve a stale value.
 *
 * Returning `undefined` unconditionally looks like the obvious way to always refetch,
 * but it also discards the payload the server rendered from: the first client render
 * then has no data and disagrees with the HTML, which Vue reports as a hydration
 * mismatch. Reusing the payload while hydrating, and nothing afterwards, keeps the
 * first paint faithful and still refetches on every later navigation.
 */
export function cacheDuringHydrationOnly<T>(key: string, nuxtApp: NuxtApp): T | undefined {
  return nuxtApp.isHydrating ? nuxtApp.payload.data[key] as T | undefined : undefined
}

/**
 * `getCachedData` for one read, or `undefined` to keep Nuxt's own policy.
 *
 * Published content is the same for every visitor and already answers with a public
 * `Cache-Control`, so Nuxt's default is exactly right: the SSR payload while hydrating,
 * then `nuxtApp.static.data`, which prerendered and prefetched payloads fill. A client
 * navigation to a prerendered route then costs no request at all. Unreleased material
 * keeps refetching after hydration.
 */
export function cacheForPublicRead(isPublic: boolean) {
  return isPublic ? undefined : cacheDuringHydrationOnly
}
