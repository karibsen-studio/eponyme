import { createHash } from 'node:crypto'

export interface EponymeRateLimitPolicy {
  limit: number
  windowMs: number
}

export interface EponymeRateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
  resetAt: Date
}

interface PrismaEponymeRateLimitRow {
  key: string
  count: number
  expiresAt: Date | string
}

export interface PrismaEponymeRateLimitClient {
  eponymeRateLimit: {
    upsert(args: {
      where: { key: string }
      create: { key: string, count: number, expiresAt: Date }
      update: { count: { increment: number } }
    }): Promise<PrismaEponymeRateLimitRow>
    deleteMany(args: { where: { expiresAt: { lte: Date } } }): Promise<{ count: number }>
  }
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Counts one hit and reports the new total for its window.
 *
 * The increment has to be atomic across instances, which is the property the whole limiter
 * rests on: a read-then-write loses hits under concurrency, and losing hits is precisely what
 * parallel requests produce. Only a backend that can add and read in one operation qualifies –
 * hence this narrow interface rather than a generic key-value one, which an ordinary unstorage
 * mount could satisfy without being safe.
 */
export interface EponymeRateLimitCounter {
  /** New count for `key`, which must expire on its own after `ttlMs`. */
  increment(key: string, ttlMs: number): Promise<number>
}

/**
 * Fixed windows shared by every Nitro instance, counted in Redis when one is wired and in
 * PostgreSQL otherwise.
 *
 * Redis is the better home for this – an `INCR` on an expiring key costs far less than an upsert
 * plus a periodic sweep – but Postgres is not a degraded fallback here. It is equally correct,
 * and it stays the default so a deployment without Redis still gets a limiter shared across
 * instances rather than a per-process one.
 */
export class EponymeRateLimitService {
  private nextCleanupAt = 0

  constructor(
    private readonly client: PrismaEponymeRateLimitClient,
    private readonly counter?: EponymeRateLimitCounter,
  ) {}

  /** Fails fast at boot when the rate-limit migration or Prisma delegate is missing. */
  async verify(now = new Date()): Promise<void> {
    await this.client.eponymeRateLimit.deleteMany({ where: { expiresAt: { lte: now } } })
    this.nextCleanupAt = now.getTime() + CLEANUP_INTERVAL_MS
  }

  async consume(scope: string, policy: EponymeRateLimitPolicy, now = new Date()): Promise<EponymeRateLimitResult> {
    assertPolicy(policy)
    const time = now.getTime()
    const window = Math.floor(time / policy.windowMs)
    const resetAt = new Date((window + 1) * policy.windowMs)
    const key = `${fingerprint(scope)}:${window}`

    const count = await this.count(key, resetAt.getTime() - time, now)

    return {
      allowed: count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - time) / 1000)),
      resetAt,
    }
  }

  private async count(key: string, ttlMs: number, now: Date): Promise<number> {
    if (this.counter) {
      try {
        return await this.counter.increment(key, ttlMs)
      }
      catch {
        // An unreachable counter must never become an open door. The database still holds a
        // correct window, so the hit is counted there rather than waved through.
      }
    }
    return await this.countInDatabase(key, new Date(now.getTime() + ttlMs), now)
  }

  private async countInDatabase(key: string, expiresAt: Date, now: Date): Promise<number> {
    const row = await this.client.eponymeRateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    })

    if (now.getTime() >= this.nextCleanupAt) {
      this.nextCleanupAt = now.getTime() + CLEANUP_INTERVAL_MS
      // Cleanup is maintenance, never a reason to disable a working limiter.
      void this.client.eponymeRateLimit.deleteMany({ where: { expiresAt: { lte: now } } }).catch(() => {})
    }

    return row.count
  }
}

/**
 * The subset of an `ioredis` client this needs, declared structurally so the module never
 * depends on `ioredis`: the application installs it for the unstorage driver, and Eponyme only
 * ever sees what the mount hands back.
 */
export interface EponymeRedisRateLimitClient {
  incr(key: string): Promise<number>
  pexpire(key: string, milliseconds: number): Promise<unknown>
}

/**
 * Counts in Redis, under `<prefix><scope hash>:<window>`.
 *
 * `prefix` is passed in whole because this talks to the client directly rather than through
 * unstorage, and going around the storage API means going around the key prefixing it would
 * have done – neither the mount point nor the driver's `base` is applied to a command issued
 * here. The caller rebuilds it so the keys still land in the namespace the deployment
 * configured instead of at the root of a shared Redis.
 *
 * The expiry is rewritten on every hit rather than only on the first. The key already carries
 * its window index, so it can only ever describe one fixed window, which makes the rewrite
 * idempotent – and it avoids the race an `if (count === 1)` guard leaves open: a process dying
 * between the two commands would strand a key with no expiry, and that key would then refuse
 * its scope forever.
 */
export function createEponymeRedisRateLimitCounter(
  client: EponymeRedisRateLimitClient,
  prefix: string,
): EponymeRateLimitCounter {
  return {
    async increment(key, ttlMs) {
      const prefixed = `${prefix}${key}`
      const count = await client.incr(prefixed)
      await client.pexpire(prefixed, Math.max(1, Math.ceil(ttlMs)))
      return count
    },
  }
}

function fingerprint(scope: string): string {
  return createHash('sha256').update(scope).digest('hex')
}

function assertPolicy(policy: EponymeRateLimitPolicy): void {
  if (!Number.isSafeInteger(policy.limit) || policy.limit < 1)
    throw new RangeError('Rate limit must be a positive safe integer.')
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1)
    throw new RangeError('Rate-limit window must be a positive safe integer.')
}
