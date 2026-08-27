import Redis from 'ioredis'
import { createStorage, prefixStorage } from 'unstorage'
import redisDriver from 'unstorage/drivers/redis'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { EponymeCache, type EponymeSharedCacheStorage } from '../src/runtime/server/services/eponyme-cache-store'
import {
  createEponymeRedisRateLimitCounter,
  EponymeRateLimitService,
  type EponymeRedisRateLimitClient,
  type PrismaEponymeRateLimitClient,
} from '../src/runtime/server/services/eponyme-rate-limit-store'

/**
 * Integration coverage against a real Redis, which is the only place two things can be
 * checked rather than assumed: that `getKeys()` reaches a prefix through the parent mount,
 * and that the driver hands back a client able to increment atomically. The unit suite mocks
 * both, and a mock written from the intended behaviour is exactly what hid the `clear()` bug.
 *
 * Skipped when no server is configured – `pnpm test` must stay runnable without one, since
 * the module does not require Redis. Configured but unreachable fails instead, and loudly:
 * setting the variable states an intent to cover this path, and silently skipping it would
 * turn a broken CI service into a green run. To run it:
 *
 * ```sh
 * docker run -d --rm -p 6399:6379 redis:7-alpine
 * EPONYME_TEST_REDIS_URL=redis://127.0.0.1:6399 pnpm test
 * ```
 */
const url = process.env.EPONYME_TEST_REDIS_URL

/** The namespace Nitro's mount point stands for, and the driver's own key prefix. */
const MOUNT = 'eponyme'

// Connected at module scope so an unreachable server is one error about the server, rather
// than every test in the file failing separately on its own first command.
const probe = await connect()

async function connect(): Promise<Redis | undefined> {
  if (!url) return undefined
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null })
  try {
    await client.connect()
    await client.ping()
    return client
  }
  catch (error) {
    await client.quit().catch(() => {})
    throw new Error(
      `EPONYME_TEST_REDIS_URL is set to ${url} but no Redis answered there. `
      + 'Start one with `docker run -d --rm -p 6399:6379 redis:7-alpine`, or unset the variable to skip these tests.',
      { cause: error },
    )
  }
}

afterAll(async () => {
  await probe?.quit().catch(() => {})
})

const describeRedis = describe.skipIf(!probe)

describeRedis('Redis-backed cache and rate limiting', () => {
  /**
   * Rebuilt per test, and shaped exactly like `useStorage('eponyme')` in Nitro: a mount at
   * `eponyme:` wrapped in `prefixStorage`. The nesting is the point – it is what makes the
   * cache prefix deeper than the mount point, which is the case `clear()` silently misses.
   */
  function createMountedStorage() {
    const root = createStorage()
    root.mount(MOUNT, redisDriver({ url: url!, base: MOUNT }))
    return {
      root,
      storage: prefixStorage(root, MOUNT) as unknown as EponymeSharedCacheStorage,
      driver: root.getMount(`${MOUNT}:probe`).driver as { getInstance?: () => unknown },
    }
  }

  afterEach(async () => {
    const keys = await probe!.keys(`${MOUNT}:*`)
    if (keys.length) await probe!.unlink(keys)
  })

  it('shares a cached read between two instances, under the configured key', async () => {
    const { storage } = createMountedStorage()
    let loads = 0
    const load = async () => {
      loads++
      return { title: 'Hello' }
    }

    await new EponymeCache({ cacheSeconds: 60, storage: () => storage }).get('row:articles/hello', load)
    const value = await new EponymeCache({ cacheSeconds: 60, storage: () => storage }).get('row:articles/hello', load)

    expect(value).toEqual({ title: 'Hello' })
    expect(loads).toBe(1)
    // `/` is normalised to `:` by unstorage, so an entry name needs no transformation of its own.
    expect(await probe!.keys(`${MOUNT}:*`)).toEqual([`${MOUNT}:row:articles:hello`])
  })

  it('applies the TTL as a real expiry rather than storing it forever', async () => {
    const { storage } = createMountedStorage()

    await new EponymeCache({ cacheSeconds: 60, storage: () => storage }).get('row:homepage', async () => 'value')

    const ttl = await probe!.ttl(`${MOUNT}:row:homepage`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })

  it('drops a prefix through the parent mount, leaving a neighbouring name alone', async () => {
    const { storage } = createMountedStorage()
    const cache = new EponymeCache({ cacheSeconds: 60, storage: () => storage })

    await cache.get('rows:blog:published', async () => 1)
    await cache.get('rows:blog:sitemap', async () => 2)
    await cache.get('rows:blogging:published', async () => 3)

    await cache.dropPrefix('rows:blog')

    expect((await probe!.keys(`${MOUNT}:*`)).sort()).toEqual([`${MOUNT}:rows:blogging:published`])
  })

  it('confirms `clear()` would not have done it, which is why `getKeys()` is used', async () => {
    const { root, storage } = createMountedStorage()
    await new EponymeCache({ cacheSeconds: 60, storage: () => storage }).get('rows:blog:published', async () => 1)

    // The mount sits at `eponyme:` and the prefix is deeper, so `clear` resolves no mount
    // at all. Asserted rather than described: this is the trap the cache is written around.
    await root.clear(`${MOUNT}:rows:blog`)

    expect(await probe!.keys(`${MOUNT}:*`)).toEqual([`${MOUNT}:rows:blog:published`])
  })

  it('exposes a client that can increment atomically, which is what moves the limiter here', async () => {
    const { driver } = createMountedStorage()
    const client = driver.getInstance?.() as Partial<EponymeRedisRateLimitClient> | undefined

    expect(typeof client?.incr).toBe('function')
    expect(typeof client?.pexpire).toBe('function')
  })

  it('counts a window in Redis, with an expiry, and never touches the database', async () => {
    const { driver } = createMountedStorage()
    const client = driver.getInstance?.() as EponymeRedisRateLimitClient
    let upserts = 0
    const prisma = {
      eponymeRateLimit: {
        async upsert() {
          upserts++
          return { key: 'unused', count: 1, expiresAt: new Date() }
        },
        async deleteMany() {
          return { count: 0 }
        },
      },
    } satisfies PrismaEponymeRateLimitClient

    const service = new EponymeRateLimitService(prisma, createEponymeRedisRateLimitCounter(client, `${MOUNT}:ratelimit:`))
    const now = new Date('2026-08-08T12:00:00.000Z')
    const policy = { limit: 2, windowMs: 60_000 }

    await expect(service.consume('form:contact:ip:198.51.100.7', policy, now)).resolves.toMatchObject({ allowed: true, remaining: 1 })
    await expect(service.consume('form:contact:ip:198.51.100.7', policy, now)).resolves.toMatchObject({ allowed: true, remaining: 0 })
    await expect(service.consume('form:contact:ip:198.51.100.7', policy, now)).resolves.toMatchObject({ allowed: false })

    expect(upserts).toBe(0)
    const [key] = await probe!.keys(`${MOUNT}:ratelimit:*`)
    expect(key).toMatch(new RegExp(`^${MOUNT}:ratelimit:[a-f0-9]{64}:\\d+$`))
    // The raw scope carries a client address; only its hash may reach the store.
    expect(key).not.toContain('198.51.100.7')
    expect(await probe!.pttl(key!)).toBeGreaterThan(0)
  })

  it('counts hits once each under concurrency, which a read-then-write would lose', async () => {
    const { driver } = createMountedStorage()
    const counter = createEponymeRedisRateLimitCounter(driver.getInstance?.() as EponymeRedisRateLimitClient, `${MOUNT}:ratelimit:`)

    const counts = await Promise.all(Array.from({ length: 50 }, () => counter.increment('concurrent:0', 60_000)))

    expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1))
  })
})
