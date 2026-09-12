import { afterEach, describe, expect, it, vi } from 'vitest'
import { EponymeCache, type EponymeSharedCacheStorage, MAX_LOCAL_ENTRIES } from '../src/runtime/server/services/eponyme-cache-store'
import type { EponymeCacheFailureContext } from '../src/runtime/types/hooks'

/**
 * A shared tier with unstorage's semantics, including the one that matters: keys are listed
 * by prefix and removed one by one. `clear(prefix)` is deliberately absent – on a namespaced
 * mount it resolves no mount at all and drops nothing, which is the trap this cache avoids.
 */
function createSharedStorage() {
  const items = new Map<string, unknown>()
  const ttls = new Map<string, number | undefined>()
  const storage: EponymeSharedCacheStorage = {
    async getItem<T>(key: string) {
      return (items.has(key) ? items.get(key) : null) as T | null
    },
    async setItem(key, value, options) {
      items.set(key, value)
      ttls.set(key, options?.ttl)
    },
    async removeItem(key) {
      items.delete(key)
    },
    async getKeys(prefix) {
      return [...items.keys()].filter(key => !prefix || key === prefix || key.startsWith(`${prefix}:`))
    },
  }
  return { storage, items, ttls }
}

/** The in-process tier, read directly: its size and its order are the point of these tests. */
function localKeys(cache: EponymeCache): string[] {
  return [...(cache as unknown as { local: Map<string, unknown> }).local.keys()]
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** The cached content, leaving out the bookkeeping key an invalidation replaces. */
function contentKeys(items: Map<string, unknown>): string[] {
  return [...items.keys()].filter(key => key !== 'invalidated')
}

/** A shared tier that is down: every call fails, which is what the cache must survive. */
function createFailingStorage(): EponymeSharedCacheStorage {
  const down = async () => {
    throw new Error('ECONNREFUSED')
  }
  return { getItem: down, setItem: down, removeItem: down, getKeys: down }
}

describe('EponymeCache', () => {
  it('serves a second instance from the shared tier instead of loading again', async () => {
    const { storage, ttls } = createSharedStorage()
    const shared = () => storage
    const load = vi.fn(async () => ({ title: 'Hello' }))

    await new EponymeCache({ cacheSeconds: 60, storage: shared }).get('row:homepage', load)
    // A separate instance: nothing in common but the shared tier.
    const value = await new EponymeCache({ cacheSeconds: 60, storage: shared }).get('row:homepage', load)

    expect(value).toEqual({ title: 'Hello' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(ttls.get('row:homepage')).toBe(60)
  })

  it('caches a missing entry rather than re-querying it', async () => {
    const { storage, items } = createSharedStorage()
    const shared = () => storage
    const load = vi.fn(async () => undefined)

    await new EponymeCache({ cacheSeconds: 60, storage: shared }).get('row:gone', load)
    const value = await new EponymeCache({ cacheSeconds: 60, storage: shared }).get('row:gone', load)

    // `undefined` is an answer worth keeping, and the envelope is what makes it storable:
    // written bare it would be a delete, and read back it would be indistinguishable from a miss.
    expect(value).toBeUndefined()
    expect(items.get('row:gone')).toEqual({ v: undefined })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shares one load between concurrent readers of a cold key', async () => {
    const load = vi.fn(async () => 'value')
    const cache = new EponymeCache({ cacheSeconds: 60 })

    const [first, second] = await Promise.all([cache.get('row:a', load), cache.get('row:a', load)])

    expect([first, second]).toEqual(['value', 'value'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('drops a prefix without taking a neighbouring name with it', async () => {
    const { storage, items } = createSharedStorage()
    const cache = new EponymeCache({ cacheSeconds: 60, storage: () => storage })

    await cache.get('rows:blog:published', async () => 1)
    await cache.get('rows:blog:sitemap', async () => 2)
    await cache.get('rows:blogging:published', async () => 3)
    await cache.dropPrefix('rows:blog')

    expect(contentKeys(items)).toEqual(['rows:blogging:published'])
  })

  it('reads through to the loader when the shared tier throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = new EponymeCache({ cacheSeconds: 60, storage: createFailingStorage })

    await expect(cache.get('row:homepage', async () => 'from the database')).resolves.toBe('from the database')
  })

  it('reports an unreachable shared tier, once per kind of failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = new EponymeCache({ cacheSeconds: 60, storage: createFailingStorage })

    await cache.get('row:a', async () => 'value')
    await cache.drop('row:a')
    const reported = warn.mock.calls.map(([message]) => String(message))
    await cache.get('row:b', async () => 'value')
    await cache.drop('row:b')

    // A read, a write and an invalidation each say their own thing, then stay quiet for a minute.
    expect(reported).toHaveLength(3)
    expect(reported.some(message => message.includes('could not be invalidated'))).toBe(true)
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('does not write back a value another instance invalidated while the read was in flight', async () => {
    const { storage, items } = createSharedStorage()
    const shared = () => storage
    // Two instances: the save lands on one, the read that started before it is served by the other.
    const reader = new EponymeCache({ cacheSeconds: 60, storage: shared })
    const writer = new EponymeCache({ cacheSeconds: 60, storage: shared })
    let answer: (value: string) => void = () => {}
    const reading = reader.get('row:homepage', () => new Promise<string>((resolve) => {
      answer = resolve
    }))

    await writer.drop('row:homepage')
    answer('previous content')
    await reading

    // The reader's own counter never moved, so the shared token is what caught it.
    expect(contentKeys(items)).toEqual([])
  })

  it('does not write back a value a save invalidated while the read was in flight', async () => {
    const { storage, items } = createSharedStorage()
    const cache = new EponymeCache({ cacheSeconds: 60, storage: () => storage })
    let answer: (value: string) => void = () => {}
    const reading = cache.get('row:homepage', () => new Promise<string>((resolve) => {
      answer = resolve
    }))

    // The save lands first, then the database answers the read that started before it.
    await cache.drop('row:homepage')
    answer('previous content')
    await reading

    expect(items.has('row:homepage')).toBe(false)
    // The next read is not affected by the one that raced.
    await cache.get('row:homepage', async () => 'current content')
    expect(items.get('row:homepage')).toEqual({ v: 'current content' })
  })

  it('hands every failure to the hook, where the log only reports the first', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failures: EponymeCacheFailureContext[] = []
    const cache = new EponymeCache({
      cacheSeconds: 60,
      storage: createFailingStorage,
      onFailure: context => failures.push(context),
    })

    await cache.get('row:a', async () => 'value')
    await cache.get('row:b', async () => 'value')

    // Two reads, two writes: a collector sees them all and decides for itself what to keep.
    expect(failures.map(failure => `${failure.operation} ${failure.key}`)).toEqual([
      'read row:a',
      'write row:a',
      'read row:b',
      'write row:b',
    ])
    expect(failures.every(failure => failure.error instanceof Error)).toBe(true)
  })

  it('bypasses both tiers when caching is disabled', async () => {
    const { storage, items } = createSharedStorage()
    const load = vi.fn(async () => 'value')
    const cache = new EponymeCache({ cacheSeconds: 0, storage: () => storage })

    await cache.get('row:homepage', load)
    await cache.get('row:homepage', load)

    expect(load).toHaveBeenCalledTimes(2)
    expect(items.size).toBe(0)
  })

  it('reuses a value for the configured window when no shared tier absorbs it', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => 'value')
    const cache = new EponymeCache({ cacheSeconds: 60 })

    await cache.get('row:homepage', load)
    await vi.advanceTimersByTimeAsync(59_000)
    await cache.get('row:homepage', load)

    // Without a shared tier, `cacheSeconds` is the local window: the option and the code agree.
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads again once the window has passed', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => 'value')
    const cache = new EponymeCache({ cacheSeconds: 60 })

    await cache.get('row:homepage', load)
    await vi.advanceTimersByTimeAsync(61_000)
    await cache.get('row:homepage', load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps the local tier short when a shared tier holds the long window', async () => {
    vi.useFakeTimers()
    const { storage } = createSharedStorage()
    const load = vi.fn(async () => 'value')
    const cache = new EponymeCache({ cacheSeconds: 60, storage: () => storage })

    await cache.get('row:homepage', load)
    await vi.advanceTimersByTimeAsync(2000)
    await cache.get('row:homepage', load)

    // The second read went past the local tier, and the shared one answered it.
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('dates the window from the answer rather than from the request', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 4000))
      return 'value'
    })
    const cache = new EponymeCache({ cacheSeconds: 5 })

    const first = cache.get('row:homepage', load)
    await vi.advanceTimersByTimeAsync(4000)
    await first
    await vi.advanceTimersByTimeAsync(4000)
    await cache.get('row:homepage', load)

    // A read that took four seconds must still be reusable for five, not for one.
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('drops expired entries instead of keeping them referenced', async () => {
    vi.useFakeTimers()
    const cache = new EponymeCache({ cacheSeconds: 60 })

    for (let index = 0; index < MAX_LOCAL_ENTRIES; index++) await cache.get(`row:${index}`, async () => index)
    await vi.advanceTimersByTimeAsync(61_000)
    await cache.get('row:fresh', async () => 'value')

    // The expired ones went first, so the newcomer did not have to evict a live entry.
    expect(localKeys(cache)).toEqual(['row:fresh'])
  })

  it('never grows past its maximum size', async () => {
    const cache = new EponymeCache({ cacheSeconds: 60 })

    for (let index = 0; index < MAX_LOCAL_ENTRIES + 50; index++) await cache.get(`row:${index}`, async () => index)

    expect(localKeys(cache).length).toBe(MAX_LOCAL_ENTRIES)
  })

  it('evicts the least recently used key when it is full of live entries', async () => {
    const cache = new EponymeCache({ cacheSeconds: 60 })
    for (let index = 0; index < MAX_LOCAL_ENTRIES; index++) await cache.get(`row:${index}`, async () => index)

    // Read again, which moves it back to the recent end.
    await cache.get('row:0', async () => 0)
    await cache.get('row:new', async () => 'value')

    const keys = localKeys(cache)
    expect(keys).toContain('row:0')
    expect(keys).toContain('row:new')
    expect(keys).not.toContain('row:1')
  })

  it('lets a rejected load fail without removing the entry that replaced it', async () => {
    const cache = new EponymeCache({ cacheSeconds: 60 })
    let fail: (error: Error) => void = () => {}
    const failing = cache.get('row:homepage', () => new Promise<string>((_, reject) => {
      fail = reject
    }))
    const rejected = expect(failing).rejects.toThrow('gone')

    // An invalidation drops the in-flight entry, then a later read caches a value under the same key.
    await cache.drop('row:homepage')
    const load = vi.fn(async () => 'value')
    await cache.get('row:homepage', load)
    fail(new Error('gone'))
    await rejected

    expect(await cache.get('row:homepage', load)).toBe('value')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
