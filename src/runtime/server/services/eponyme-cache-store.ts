/** Two-tier read cache: an in-process map in front of a shared unstorage mount. */

/** How long the in-process tier keeps a value, in milliseconds. */
const LOCAL_MS = 1000

interface EponymeCacheEnvelope<T> {
  v: T
}

export interface EponymeSharedCacheStorage {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T, options?: { ttl?: number }): Promise<void>
  removeItem(key: string): Promise<void>
  getKeys(prefix?: string): Promise<string[]>
}

export class EponymeCache {
  private readonly local = new Map<string, { value: unknown, expires: number }>()
  private readonly ttlMs: number
  private readonly ttlSeconds: number
  private readonly resolveShared: (() => EponymeSharedCacheStorage | undefined) | undefined

  constructor(options: { cacheSeconds?: number, storage?: () => EponymeSharedCacheStorage | undefined } = {}) {
    this.ttlMs = Math.max(0, options.cacheSeconds ?? 5) * 1000
    this.ttlSeconds = Math.ceil(this.ttlMs / 1000)
    this.resolveShared = options.storage
  }

  /**
   * Resolved per call rather than held: `useStorage()` needs Nitro to be running, and the service is built
   * on first request, not on import.
   */
  private shared() {
    return this.resolveShared?.()
  }

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.ttlMs) return await load()

    const hit = this.local.get(key)
    if (hit && hit.expires > Date.now()) return await (hit.value as Promise<T>)

    // The promise is stored before it settles, so concurrent readers of a cold key share it.
    const pending = this.read(key, load).catch((error) => {
      this.local.delete(key)
      throw error
    })
    this.local.set(key, { value: pending, expires: Date.now() + LOCAL_MS })
    return await pending
  }

  private async read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const shared = this.shared()
    // A cache that cannot be reached is a cache miss, never a failed read: the database still holds the
    // answer, and a public page must not go down with Redis.
    const cached = shared && await shared.getItem<EponymeCacheEnvelope<T>>(key).catch(() => null)
    if (cached && typeof cached === 'object' && 'v' in cached) return cached.v

    const value = await load()
    await shared?.setItem(key, { v: value } satisfies EponymeCacheEnvelope<T>, { ttl: this.ttlSeconds }).catch(() => {})
    return value
  }

  async drop(key: string): Promise<void> {
    this.local.delete(key)
    await this.shared()?.removeItem(key).catch(() => {})
  }

  /**
   * Drops every key under `prefix`, which is how one write clears the several cached shapes of a listing at
   * once.
   */
  async dropPrefix(prefix: string): Promise<void> {
    for (const key of this.local.keys()) if (key.startsWith(`${prefix}:`)) this.local.delete(key)
    const shared = this.shared()
    if (!shared) return
    await shared.getKeys(prefix)
      .then(keys => Promise.all(keys.map(key => shared.removeItem(key))))
      .catch(() => {})
  }
}
