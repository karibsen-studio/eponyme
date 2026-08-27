import { describe, expect, it } from 'vitest'
import {
  EponymeAuditService,
  type PrismaEponymeAuditClient,
} from '../src/runtime/server/services/eponyme-audit-store'

function createAuditClient() {
  const events: Array<Record<string, unknown>> = []
  const maintenance = new Map<string, Date>()
  const client: PrismaEponymeAuditClient = {
    eponymeAuditEvent: {
      async create({ data }) {
        const row = { ...data, occurredAt: new Date() }
        events.push(row)
        return row as never
      },
      async findMany(args) {
        const options = args as {
          where?: Record<string, unknown>
          orderBy?: unknown
          take?: number
          cursor?: { id: string }
          skip?: number
          select?: { id: true }
        }
        let rows = [...events]
        const occurredAt = options.where?.occurredAt as { lt?: Date } | undefined
        if (occurredAt?.lt)
          rows = rows.filter(row => new Date(row.occurredAt as Date) < occurredAt.lt!)
        rows.sort((a, b) => new Date(b.occurredAt as Date).getTime() - new Date(a.occurredAt as Date).getTime())
        if (options.cursor) {
          const index = rows.findIndex(row => row.id === options.cursor?.id)
          rows = rows.slice(Math.max(0, index + (options.skip ?? 0)))
        }
        rows = rows.slice(0, options.take)
        return rows.map(row => options.select ? { id: row.id } : row) as never
      },
      async deleteMany({ where }) {
        const ids = new Set(where.id.in)
        const before = events.length
        for (let index = events.length - 1; index >= 0; index--) {
          if (ids.has(String(events[index]!.id))) events.splice(index, 1)
        }
        return { count: before - events.length }
      },
    },
    eponymeMaintenanceState: {
      async findUnique({ where }) {
        const lastRunAt = maintenance.get(where.key)
        return lastRunAt ? { key: where.key, lastRunAt } : null
      },
      async create({ data }) {
        if (maintenance.has(data.key)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
        maintenance.set(data.key, data.lastRunAt)
        return data
      },
      async updateMany({ where, data }) {
        const current = maintenance.get(where.key)
        if (!current || current.getTime() !== new Date(where.lastRunAt).getTime()) return { count: 0 }
        maintenance.set(where.key, data.lastRunAt)
        return { count: 1 }
      },
    },
  }
  return { client, events }
}

describe('EponymeAuditService', () => {
  it('drops secrets and complete content from metadata', async () => {
    const { client, events } = createAuditClient()
    const service = new EponymeAuditService(client)
    await service.record({
      action: 'auth.password_changed',
      metadata: {
        previousRole: 'viewer',
        password: 'never store this',
        sessionToken: 'never store this either',
        content: { title: 'private draft' },
      },
    })

    expect(events[0]?.metadata).toEqual({ previousRole: 'viewer' })
  })

  it('paginates with an opaque event cursor', async () => {
    const { client } = createAuditClient()
    const service = new EponymeAuditService(client)
    for (let index = 0; index < 3; index++)
      await service.record({ action: `event.${index}` })

    const first = await service.list({ limit: 2 })
    expect(first.events).toHaveLength(2)
    expect(first.nextCursor).toBeTruthy()
    const second = await service.list({ limit: 2, cursor: first.nextCursor! })
    expect(second.events).toHaveLength(1)
  })

  it('prunes expired events once per maintenance interval', async () => {
    const { client, events } = createAuditClient()
    const service = new EponymeAuditService(client)
    const now = new Date('2026-08-25T12:00:00.000Z')
    events.push(
      auditRow('old', new Date('2025-08-24T00:00:00.000Z')),
      auditRow('recent', new Date('2026-08-24T00:00:00.000Z')),
    )

    await expect(service.prune(365, 24, now)).resolves.toBe(1)
    await expect(service.prune(365, 24, now)).resolves.toBe(0)
    expect(events.map(event => event.id)).toEqual(['recent'])
  })
})

function auditRow(id: string, occurredAt: Date): Record<string, unknown> {
  return {
    id,
    occurredAt,
    actorUserId: null,
    actorUsername: null,
    action: 'test',
    outcome: 'success',
    resourceType: null,
    resourceName: null,
    targetUserId: null,
    ipAddress: null,
    userAgent: null,
    metadata: null,
  }
}
