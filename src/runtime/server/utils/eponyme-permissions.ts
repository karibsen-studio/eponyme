import { t } from '#eponyme/locale'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import type { EponymeAuthUser } from '../../types'
import type { EponymePermissionAction, EponymeResource } from '../../types/permissions'
import { requireEponymeUser } from './auth'
import { recordEponymeAudit } from './eponyme-audit'
import { hasEponymePermission } from './eponyme-role-registry'

export {
  getEponymePermissions,
  getEponymeRoleOptions,
  getEponymeRoleRegistry,
  hasEponymePermission,
  resolveEponymeContentResource,
} from './eponyme-role-registry'

/**
 * A refusal is worth recording, and a flood of them must not become a write flood of its own: the same
 * account refused the same thing is only recorded once per window, per process.
 */
const REFUSAL_WINDOW_MS = 60_000
const REFUSAL_MEMORY = 1000
const recentRefusals = new Map<string, number>()

export async function requireEponymePermission(
  event: H3Event,
  action: EponymePermissionAction,
  resource: EponymeResource,
) {
  const user = await requireEponymeUser(event)
  if (!hasEponymePermission(user.role, action, resource)) {
    await recordRefusal(event, user, action, resource)
    throw createError({ status: 403, message: t('server.forbidden') })
  }
  return user
}

async function recordRefusal(
  event: H3Event,
  user: EponymeAuthUser,
  action: EponymePermissionAction,
  resource: EponymeResource,
): Promise<void> {
  const key = `${user.id}:${action}:${resource.kind}:${resource.name}`
  const now = Date.now()
  const seenAt = recentRefusals.get(key)
  if (seenAt !== undefined && now - seenAt < REFUSAL_WINDOW_MS) return
  // Insertion order is time order, so the first entry is the oldest.
  if (recentRefusals.size >= REFUSAL_MEMORY) {
    const oldest = recentRefusals.keys().next().value
    if (oldest !== undefined) recentRefusals.delete(oldest)
  }
  recentRefusals.delete(key)
  recentRefusals.set(key, now)

  await recordEponymeAudit(event, {
    actor: user,
    action: 'permission.refused',
    outcome: 'failure',
    resourceType: resource.kind,
    resourceName: resource.name,
    metadata: { permission: action, role: user.role },
  })
}
