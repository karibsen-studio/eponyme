import { createError, defineEventHandler, getQuery } from 'h3'
import { useEponymeAuditService } from '../services/eponyme-audit-service'
import { requireEponymePermission } from '../utils/eponyme-permissions'

export default defineEventHandler(async (event) => {
  await requireEponymePermission(event, 'audit.read', { kind: 'system', name: 'audit' })
  const query = getQuery(event)
  const from = readDate(query.from)
  const to = readDate(query.to, true)
  if ((query.from && !from) || (query.to && !to))
    throw createError({ status: 400, message: 'Invalid audit date.' })

  return await useEponymeAuditService().list({
    cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
    limit: readLimit(query.limit),
    action: typeof query.action === 'string' ? query.action.trim() : undefined,
    actorUserId: typeof query.actorUserId === 'string' ? query.actorUserId.trim() : undefined,
    resourceType: typeof query.resourceType === 'string' ? query.resourceType.trim() : undefined,
    resourceName: typeof query.resourceName === 'string' ? query.resourceName.trim() : undefined,
    from,
    to,
  })
})

function readLimit(value: unknown): number {
  if (value === undefined) return 50
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1) return 50
  return Math.min(limit, 100)
}

function readDate(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const date = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value)
  return Number.isNaN(date.getTime()) ? undefined : date
}
