import { describe, expect, it, vi } from 'vitest'
import { EponymeCache, type EponymeSharedCacheStorage } from '../src/runtime/server/services/eponyme-cache-store'

/**
 * A shared tier with unstorage's semantics, including the one that matters: keys are listed
 * by prefix and removed one by one. `clear(prefix)` is deliberately absent — on a namespaced
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

    expect([...items.keys()]).toEqual(['rows:blogging:published'])
  })

  it('reads through to the loader when the shared tier throws', async () => {
    const failing: EponymeSharedCacheStorage = {
      getItem: async () => {
        throw new Error('ECONNREFUSED')
      },
      setItem: async () => {
        throw new Error('ECONNREFUSED')
      },
      removeItem: async () => {},
      getKeys: async () => {
        throw new Error('ECONNREFUSED')
      },
    }
    const cache = new EponymeCache({ cacheSeconds: 60, storage: () => failing })

    await expect(cache.get('row:homepage', async () => 'from the database')).resolves.toBe('from the database')
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
})
