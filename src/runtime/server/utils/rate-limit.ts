import { t } from '#eponyme/locale'
import { createError, getRequestIP, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeRateLimitService } from '../services/eponyme-rate-limit-service'
import type { EponymeRateLimitPolicy } from '../services/eponyme-rate-limit-store'

export function eponymeRateLimitPolicies() {
  const config = useRuntimeConfig().eponymeRateLimits
  return {
    loginIp: { limit: config.loginPerIp, windowMs: 60_000 },
    loginGlobal: { limit: config.loginGlobal, windowMs: 60_000 },
    loginAccountFailure: { limit: config.loginAccountFailures, windowMs: 15 * 60_000 },
    formIp: { limit: config.formPerIp, windowMs: 60_000 },
    formGlobal: { limit: config.formGlobal, windowMs: 60_000 },
  } satisfies Record<string, EponymeRateLimitPolicy>
}

export async function assertEponymeRateLimit(
  event: H3Event,
  scope: string,
  policy: EponymeRateLimitPolicy,
): Promise<void> {
  const result = await useEponymeRateLimitService().consume(scope, policy)
  if (result.allowed) return

  setResponseHeader(event, 'Retry-After', result.retryAfterSeconds)
  setResponseHeader(event, 'X-RateLimit-Limit', String(result.limit))
  setResponseHeader(event, 'X-RateLimit-Remaining', '0')
  setResponseHeader(event, 'X-RateLimit-Reset', String(Math.ceil(result.resetAt.getTime() / 1000)))
  throw createError({ statusCode: 429, statusMessage: t('server.rateLimited') })
}

/** Prefer the socket address; use the first proxy address only when the runtime has no peer. */
export function eponymeRequestClientKey(event: H3Event): string {
  return getRequestIP(event)
    ?? getRequestIP(event, { xForwardedFor: true })
    ?? 'unknown-client'
}
