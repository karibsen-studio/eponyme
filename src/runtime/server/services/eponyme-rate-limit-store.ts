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

/** Cap on the refusal memory below, so a flood of distinct scopes cannot leak memory. */
const REFUSAL_MEMORY = 10_000

/** Counts one hit and reports the new total for its window. */
export interface EponymeRateLimitCounter {
  /** New count for `key`, which must expire on its own after `ttlMs`. */
  increment(key: string, ttlMs: number): Promise<number>
}

/**
 * Fixed windows shared by every Nitro instance, counted in Redis when one is wired and in PostgreSQL
 * otherwise.
 */
export class EponymeRateLimitService {
  private nextCleanupAt = 0
  private readonly refused = new Map<string, number>()

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

    // Safe because the count of a fixed window only rises: memory refuses, it never allows.
    if (this.isRefused(key, time)) return refusal(policy, resetAt, time)

    const count = await this.count(key, resetAt.getTime() - time, now)
    if (count > policy.limit) this.remember(key, resetAt.getTime())

    return {
      allowed: count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: retryAfter(resetAt, time),
      resetAt,
    }
  }

  private isRefused(key: string, time: number): boolean {
    const until = this.refused.get(key)
    if (until === undefined) return false
    if (until > time) return true
    this.refused.delete(key)
    return false
  }

  private remember(key: string, resetAt: number): void {
    // Insertion order is window order, so the first entry is the closest to expiry.
    if (this.refused.size >= REFUSAL_MEMORY) {
      const oldest = this.refused.keys().next().value
      if (oldest !== undefined) this.refused.delete(oldest)
    }
    this.refused.set(key, resetAt)
  }

  private async count(key: string, ttlMs: number, now: Date): Promise<number> {
    if (this.counter) {
      try {
        return await this.counter.increment(key, ttlMs)
      }
      catch {
        // An unreachable counter must never become an open door.
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
 * The subset of an `ioredis` client this needs, declared structurally so the module never depends on
 * `ioredis`: the application installs it for the unstorage driver, and Eponyme only ever sees what the
 * mount hands back.
 */
export interface EponymeRedisRateLimitClient {
  incr(key: string): Promise<number>
  pexpire(key: string, milliseconds: number): Promise<unknown>
}

/** Counts in Redis, under `<prefix><scope hash>:<window>`. */
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

function retryAfter(resetAt: Date, time: number): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - time) / 1000))
}

function refusal(policy: EponymeRateLimitPolicy, resetAt: Date, time: number): EponymeRateLimitResult {
  return {
    allowed: false,
    limit: policy.limit,
    remaining: 0,
    retryAfterSeconds: retryAfter(resetAt, time),
    resetAt,
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
