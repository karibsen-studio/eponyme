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

/** PostgreSQL-backed fixed windows remain shared by every Nitro instance. */
export class EponymeRateLimitService {
  private nextCleanupAt = 0

  constructor(private readonly client: PrismaEponymeRateLimitClient) {}

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

    const count = await this.countInDatabase(key, resetAt, now)

    return {
      allowed: count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - time) / 1000)),
      resetAt,
    }
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

function fingerprint(scope: string): string {
  return createHash('sha256').update(scope).digest('hex')
}

function assertPolicy(policy: EponymeRateLimitPolicy): void {
  if (!Number.isSafeInteger(policy.limit) || policy.limit < 1)
    throw new RangeError('Rate limit must be a positive safe integer.')
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1)
    throw new RangeError('Rate-limit window must be a positive safe integer.')
}
