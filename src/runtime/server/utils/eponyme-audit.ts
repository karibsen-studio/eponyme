import { getHeader, getRequestIP } from 'h3'
import type { H3Event } from 'h3'
import type { EponymeAuditInput, EponymeAuthUser } from '../../types'
import { useEponymeAuditService } from '../services/eponyme-audit-service'

export async function recordEponymeAudit(
  event: H3Event,
  input: EponymeAuditInput & { actor?: EponymeAuthUser | null, connection?: boolean },
) {
  const { actor, connection, ...audit } = input
  return await useEponymeAuditService().record({
    ...audit,
    actorUserId: audit.actorUserId ?? actor?.id ?? null,
    actorUsername: audit.actorUsername ?? actor?.username ?? null,
    ipAddress: connection ? getRequestIP(event, { xForwardedFor: true }) : audit.ipAddress,
    userAgent: connection ? getHeader(event, 'user-agent') : audit.userAgent,
  })
}
