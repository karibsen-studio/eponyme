import type { NuxtApp } from '#app'

/** `getCachedData` for reads that must never serve a stale value. */
export function cacheDuringHydrationOnly<T>(key: string, nuxtApp: NuxtApp): T | undefined {
  return nuxtApp.isHydrating ? nuxtApp.payload.data[key] as T | undefined : undefined
}

/** `getCachedData` for one read, or `undefined` to keep Nuxt's own policy. */
export function cacheForPublicRead(isPublic: boolean) {
  return isPublic ? undefined : cacheDuringHydrationOnly
}
