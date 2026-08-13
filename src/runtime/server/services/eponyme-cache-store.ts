/**
 * Two-tier read cache: an in-process map in front of a shared unstorage mount.
 *
 * The two tiers answer different problems, which is why neither replaces the other:
 *
 * - The map deduplicates concurrent readers of a cold key — it holds the in-flight promise,
 *   so a page reading the same entry from a singleton, a listing and a layout starts one
 *   query rather than three. It also absorbs repeated reads inside a single request without
 *   a network hop.
 * - The shared tier is what a write can actually invalidate across instances. The map alone
 *   only ever clears the instance that served the save, so every other one keeps answering
 *   with the previous content for the rest of its TTL.
 *
 * The map's retention is therefore deliberately short and independent of `cacheSeconds`:
 * it bounds how long an instance can miss an invalidation another instance published, and
 * that window is the whole reason the shared tier exists. `cacheSeconds` governs the shared
 * tier, where an invalidation is visible to everyone.
 *
 * Without a configured mount the shared tier is absent and this degrades to the in-process
 * cache the service has always had.
 */

/**
 * How long the in-process tier keeps a value, in milliseconds.
 *
 * Short on purpose — see above. It is not configurable because the useful range is narrow:
 * long enough to coalesce the reads of one render, short enough that a publication is not
 * invisible for any length of time an editor would notice.
 */
const LOCAL_MS = 1000

/**
 * Values are wrapped before they are stored.
 *
 * `undefined` is a cachable answer here — a missing or trashed entry reads as one, and it is
 * exactly the case worth caching, since nothing in the row protects it from being re-queried.
 * But `setItem(key, undefined)` removes the key instead of storing it, and `getItem` answers
 * `null` for a key that is absent, so an unwrapped `undefined` would be written as a miss and
 * read back as a miss. The envelope makes "stored, and the value is undefined" expressible.
 */
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
   * Resolved per call rather than held: `useStorage()` needs Nitro to be running, and the
   * service is built on first request, not on import.
   *
   * A mount that was never declared resolves to an empty memory storage rather than throwing,
   * which would silently give every instance its own second copy of the map. Reads and writes
   * are guarded instead, so a typo in `cacheStorage` costs the shared tier and nothing else.
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
    // A cache that cannot be reached is a cache miss, never a failed read: the database
    // still holds the answer, and a public page must not go down with Redis.
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
   * Drops every key under `prefix`, which is how one write clears the several cached shapes
   * of a listing at once.
   *
   * Listed and removed rather than cleared: `clear(prefix)` resolves only the mounts sitting
   * below the prefix, so on a namespaced mount — the normal case here, since the cache lives
   * at `eponyme:` and the prefix is deeper — it matches nothing and silently drops nothing.
   * `getKeys()` is the one that walks the parent mount, and it is what makes an invalidation
   * actually happen.
   *
   * The prefix is matched on the separator, so dropping `rows:blog` cannot take
   * `rows:blogging` with it.
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
