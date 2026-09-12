/** Two-tier read cache: an in-process map in front of a shared unstorage mount. */
import { randomUUID } from 'node:crypto'
import type { EponymeCacheFailureContext, EponymeCacheOperation } from '../../types/hooks'

/**
 * How long the in-process tier keeps a value when a shared tier is configured, in milliseconds. There the
 * long window belongs to the shared tier, which an invalidation reaches on every instance at once, and the
 * local one only has to coalesce the reads of a single render.
 */
const COALESCE_MS = 1000

/**
 * Most keys the in-process tier holds. Without one, a key read once stays referenced with its payload for
 * the life of the process, since nothing sweeps an entry that is never read again.
 */
export const MAX_LOCAL_ENTRIES = 500

/** How often the same kind of shared-tier failure may be reported, so a flapping Redis is not a log flood. */
const WARN_INTERVAL_MS = 60_000

/**
 * Shared key holding a token replaced by every invalidation. A read that started before a save and answers
 * after it carries the previous content, and writing that to the cache would put it back for a whole window.
 * The local counter catches it on the instance that served the save; this catches it on all the others.
 */
const INVALIDATION_KEY = 'invalidated'

/** What each kind of failure means for the deployment, since none of them fails the request. */
const FAILURE_MESSAGES: Record<EponymeCacheOperation, string> = {
  read: 'The shared content cache could not be read. Reads fall back to the database.',
  write: 'The shared content cache could not be written. The value stays uncached.',
  invalidate: 'The shared content cache could not be invalidated. Other instances may serve the previous content until it expires.',
}

interface EponymeCacheEnvelope<T> {
  v: T
}

/** `expires` is `Infinity` while the load is in flight, so every concurrent reader joins it. */
interface EponymeLocalEntry {
  value: Promise<unknown>
  expires: number
}

export interface EponymeSharedCacheStorage {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T, options?: { ttl?: number }): Promise<void>
  removeItem(key: string): Promise<void>
  getKeys(prefix?: string): Promise<string[]>
}

export class EponymeCache {
  /** Insertion order is access order: a hit is re-inserted, so the oldest key is the least recently used. */
  private readonly local = new Map<string, EponymeLocalEntry>()
  private readonly ttlMs: number
  private readonly ttlSeconds: number
  private readonly localMs: number
  private readonly resolveShared: (() => EponymeSharedCacheStorage | undefined) | undefined
  private readonly onFailure: ((context: EponymeCacheFailureContext) => void) | undefined
  /** Bumped by every invalidation, so a read in flight can tell that what it holds is now out of date. */
  private invalidations = 0
  private readonly warnedAt = new Map<string, number>()

  constructor(options: {
    cacheSeconds?: number
    storage?: () => EponymeSharedCacheStorage | undefined
    onFailure?: (context: EponymeCacheFailureContext) => void
  } = {}) {
    this.ttlMs = Math.max(0, options.cacheSeconds ?? 5) * 1000
    this.ttlSeconds = Math.ceil(this.ttlMs / 1000)
    this.resolveShared = options.storage
    this.onFailure = options.onFailure
    this.localMs = options.storage ? Math.min(this.ttlMs, COALESCE_MS) : this.ttlMs
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
    if (hit && hit.expires > Date.now()) {
      this.local.delete(key)
      this.local.set(key, hit)
      return await (hit.value as Promise<T>)
    }

    // The promise is stored before it settles, so concurrent readers of a cold key share it.
    const entry: EponymeLocalEntry = { value: undefined as unknown as Promise<unknown>, expires: Number.POSITIVE_INFINITY }
    entry.value = this.read(key, load).then(
      (value) => {
        // Dated from the answer rather than from the request, so a slow read still gets its full window.
        entry.expires = Date.now() + this.localMs
        return value
      },
      (error) => {
        // Only if this promise is still the cached one: a later read may already have replaced it.
        if (this.local.get(key) === entry) this.local.delete(key)
        throw error
      },
    )
    this.evict()
    this.local.set(key, entry)
    return await (entry.value as Promise<T>)
  }

  /** Makes room for one key: expired entries first, then the least recently used ones. */
  private evict(): void {
    if (this.local.size < MAX_LOCAL_ENTRIES) return
    const now = Date.now()
    for (const [key, entry] of this.local) if (entry.expires <= now) this.local.delete(key)
    for (const key of this.local.keys()) {
      if (this.local.size < MAX_LOCAL_ENTRIES) break
      this.local.delete(key)
    }
  }

  private async read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const shared = this.shared()
    const invalidations = this.invalidations
    // A cache that cannot be reached is a cache miss, never a failed read: the database still holds the
    // answer, and a public page must not go down with Redis.
    const [cached, token] = await Promise.all([
      shared?.getItem<EponymeCacheEnvelope<T>>(key).catch((error) => {
        this.report('read', key, error)
        return null
      }),
      this.invalidationToken(shared),
    ])
    if (cached && typeof cached === 'object' && 'v' in cached) return cached.v

    const value = await load()
    if (!shared || invalidations !== this.invalidations) return value
    // Read a second time rather than trusted from the start: the save may have landed on another instance,
    // where the local counter of this one never moved.
    if (await this.invalidationToken(shared) !== token) return value
    await shared.setItem(key, { v: value } satisfies EponymeCacheEnvelope<T>, { ttl: this.ttlSeconds })
      .catch(error => this.report('write', key, error))
    return value
  }

  /** The current invalidation token, or `null` when there is no shared tier or it cannot be read. */
  private async invalidationToken(shared: EponymeSharedCacheStorage | undefined): Promise<string | null> {
    if (!shared) return null
    return await shared.getItem<string>(INVALIDATION_KEY).catch(() => null)
  }

  /** Replaces the invalidation token, which is what tells the other instances that a read is now late. */
  private async markInvalidated(shared: EponymeSharedCacheStorage, key: string): Promise<void> {
    await shared.setItem(INVALIDATION_KEY, randomUUID()).catch(error => this.report('invalidate', key, error))
  }

  /**
   * Reports a shared-tier failure without ever failing on it. The hook fires every time, for a collector
   * that counts them; the log is throttled per kind, for a human reading it.
   */
  private report(operation: EponymeCacheOperation, key: string, error: unknown): void {
    this.onFailure?.({ operation, key, error })
    const now = Date.now()
    if (now - (this.warnedAt.get(operation) ?? Number.NEGATIVE_INFINITY) < WARN_INTERVAL_MS) return
    this.warnedAt.set(operation, now)
    console.warn(`[Eponyme] ${FAILURE_MESSAGES[operation]}`, error)
  }

  async drop(key: string): Promise<void> {
    this.invalidations++
    this.local.delete(key)
    const shared = this.shared()
    if (!shared) return
    // Marked before the removal: a read that writes in between is cleaned up by the removal itself, and one
    // that writes after has already seen the new token.
    await this.markInvalidated(shared, key)
    await shared.removeItem(key).catch(error => this.report('invalidate', key, error))
  }

  /**
   * Drops every key under `prefix`, which is how one write clears the several cached shapes of a listing at
   * once.
   */
  async dropPrefix(prefix: string): Promise<void> {
    this.invalidations++
    for (const key of this.local.keys()) if (key.startsWith(`${prefix}:`)) this.local.delete(key)
    const shared = this.shared()
    if (!shared) return
    await this.markInvalidated(shared, prefix)
    await shared.getKeys(prefix)
      .then(keys => Promise.all(keys.map(key => shared.removeItem(key))))
      .catch(error => this.report('invalidate', prefix, error))
  }
}
