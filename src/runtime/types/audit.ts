export type EponymeAuditOutcome = 'success' | 'failure'

export interface EponymeAuditEvent {
  id: string
  occurredAt: string
  actorUserId: string | null
  actorUsername: string | null
  action: string
  outcome: EponymeAuditOutcome
  resourceType: string | null
  resourceName: string | null
  targetUserId: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown> | null
}

export interface EponymeAuditPage {
  events: EponymeAuditEvent[]
  nextCursor: string | null
}

export interface EponymeAuditInput {
  actorUserId?: string | null
  actorUsername?: string | null
  action: string
  outcome?: EponymeAuditOutcome
  resourceType?: string | null
  resourceName?: string | null
  targetUserId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
}
