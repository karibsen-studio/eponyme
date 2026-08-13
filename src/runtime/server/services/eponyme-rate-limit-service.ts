import prisma from '#eponyme/prisma'
import { useRuntimeConfig, useStorage } from 'nitropack/runtime'
import {
  createEponymeRedisRateLimitCounter,
  EponymeRateLimitService,
  type EponymeRateLimitCounter,
  type EponymeRedisRateLimitClient,
  type PrismaEponymeRateLimitClient,
} from './eponyme-rate-limit-store'

let rateLimitService: EponymeRateLimitService | undefined

export function useEponymeRateLimitService(): EponymeRateLimitService {
  return rateLimitService ??= new EponymeRateLimitService(
    prisma as PrismaEponymeRateLimitClient,
    resolveCounter(useRuntimeConfig().eponymeContent.cacheStorage),
  )
}

/**
 * Reuses the mount configured for the content cache, when it can count atomically.
 *
 * The limiter shares `cacheStorage` rather than taking an option of its own: a deployment that
 * has wired Redis has wired one Redis, and a second name to keep in sync would only be a second
 * thing to get wrong. The key prefixes keep the two apart inside it.
 *
 * The mount is asked for its underlying client rather than used through the unstorage API,
 * because that API cannot express an atomic increment — `getItem` then `setItem` drops hits
 * under exactly the concurrency a limiter exists to survive. A driver that exposes no such
 * client, or one that is not Redis-shaped, is left alone and the database keeps counting.
 */
function resolveCounter(mount: string): EponymeRateLimitCounter | undefined {
  const name = mount.trim()
  if (!name) return undefined
  try {
    // Resolved from the unprefixed root storage: `getMount` is one of the few methods
    // `prefixStorage` does not rewrite, so asking a namespaced handle would answer with
    // whatever is mounted at the root instead of with the mount being looked for.
    const found = useStorage().getMount(`${name}:ratelimit`)
    const driver = found.driver as { getInstance?: () => unknown, options?: { base?: string } }
    const client = driver.getInstance?.() as Partial<EponymeRedisRateLimitClient> | undefined
    if (typeof client?.incr !== 'function' || typeof client.pexpire !== 'function') return undefined
    // `base` is the driver's own prefix, applied inside its methods and so absent from a
    // direct command. `found.base` carries the mount point, which the driver never sees.
    const base = driver.options?.base?.replace(/:$/, '')
    return createEponymeRedisRateLimitCounter(client as EponymeRedisRateLimitClient, `${base ? `${base}:` : ''}ratelimit:`)
  }
  catch {
    // A mount that cannot be resolved is not a reason to fail a request: the database path
    // is still there, and it is the one that would have been used without Redis at all.
    return undefined
  }
}
