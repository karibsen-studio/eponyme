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
