import { randomUUID } from 'node:crypto'
import type { EponymeAuditEvent, EponymeAuditInput, EponymeAuditPage } from '../../types/audit'

type DateValue = Date | string

interface PrismaAuditRow {
  id: string
  occurredAt: DateValue
  actorUserId: string | null
  actorUsername: string | null
  action: string
  outcome: string
  resourceType: string | null
  resourceName: string | null
  targetUserId: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: unknown
}

export interface PrismaEponymeAuditClient {
  eponymeAuditEvent: {
    create(args: { data: Record<string, unknown> }): Promise<PrismaAuditRow>
    findMany(args: Record<string, unknown>): Promise<PrismaAuditRow[]>
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>
  }
  eponymeMaintenanceState: {
    findUnique(args: { where: { key: string } }): Promise<{ key: string, lastRunAt: DateValue } | null>
    create(args: { data: { key: string, lastRunAt: Date } }): Promise<unknown>
    updateMany(args: {
      where: { key: string, lastRunAt: DateValue }
      data: { lastRunAt: Date }
    }): Promise<{ count: number }>
  }
}

export class EponymeAuditService {
  constructor(private readonly client: PrismaEponymeAuditClient) {}

  async record(input: EponymeAuditInput): Promise<EponymeAuditEvent> {
    const row = await this.client.eponymeAuditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: input.actorUserId ?? null,
        actorUsername: cleanText(input.actorUsername, 100),
        action: input.action,
        outcome: input.outcome ?? 'success',
        resourceType: cleanText(input.resourceType, 40),
        resourceName: cleanText(input.resourceName, 500),
        targetUserId: cleanText(input.targetUserId, 100),
        ipAddress: cleanText(input.ipAddress, 100),
        userAgent: cleanText(input.userAgent, 500),
        metadata: sanitizeMetadata(input.metadata),
      },
    })
    return toAuditEvent(row)
  }

  async list(options: {
    cursor?: string
    limit?: number
    action?: string
    actorUserId?: string
    resourceType?: string
    resourceName?: string
    from?: Date
    to?: Date
  } = {}): Promise<EponymeAuditPage> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
    const where: Record<string, unknown> = {}
    if (options.action) where.action = options.action
    if (options.actorUserId) where.actorUserId = options.actorUserId
    if (options.resourceType) where.resourceType = options.resourceType
    if (options.resourceName) where.resourceName = { contains: options.resourceName, mode: 'insensitive' }
    if (options.from || options.to) {
      where.occurredAt = {
        ...(options.from ? { gte: options.from } : {}),
        ...(options.to ? { lte: options.to } : {}),
      }
    }
    const rows = await this.client.eponymeAuditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    return {
      events: page.map(toAuditEvent),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    }
  }

  async prune(retentionDays: number, intervalHours: number, now = new Date()): Promise<number> {
    if (!await this.claimMaintenance(intervalHours, now)) return 0
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
    let deleted = 0
    while (true) {
      const rows = await this.client.eponymeAuditEvent.findMany({
        where: { occurredAt: { lt: cutoff } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
        take: 500,
      })
      const ids = rows.map(row => row.id)
      if (!ids.length) return deleted
      deleted += (await this.client.eponymeAuditEvent.deleteMany({ where: { id: { in: ids } } })).count
      if (ids.length < 500) return deleted
    }
  }

  private async claimMaintenance(intervalHours: number, now: Date): Promise<boolean> {
    const key = 'audit-retention'
    const state = await this.client.eponymeMaintenanceState.findUnique({ where: { key } })
    if (!state) {
      try {
        await this.client.eponymeMaintenanceState.create({ data: { key, lastRunAt: now } })
        return true
      }
      catch (error) {
        if (isUniqueConstraintViolation(error)) return false
        throw error
      }
    }
    if (new Date(state.lastRunAt).getTime() > now.getTime() - intervalHours * 60 * 60 * 1000) return false
    const claimed = await this.client.eponymeMaintenanceState.updateMany({
      where: { key, lastRunAt: state.lastRunAt },
      data: { lastRunAt: now },
    })
    return claimed.count === 1
  }
}

function toAuditEvent(row: PrismaAuditRow): EponymeAuditEvent {
  return {
    ...row,
    occurredAt: new Date(row.occurredAt).toISOString(),
    outcome: row.outcome === 'failure' ? 'failure' : 'success',
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : null,
  }
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  return clean ? [...clean].slice(0, maxLength).join('') : null
}

function sanitizeMetadata(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null
  const forbidden = /password|secret|token|cookie|content|data/i
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !forbidden.test(key))
    .map(([key, item]) => [key, sanitizeMetadataValue(item)]))
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return [...value].slice(0, 500).join('')
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeMetadataValue)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/password|secret|token|cookie|content|data/i.test(key))
    .map(([key, item]) => [key, sanitizeMetadataValue(item)]))
  return String(value)
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002')
}
