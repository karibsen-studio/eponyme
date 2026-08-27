import { t } from '#eponyme/locale'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import type { EponymePermissionAction, EponymeResource } from '../../types/permissions'
import { requireEponymeUser } from './auth'
import { hasEponymePermission } from './eponyme-role-registry'

export {
  getEponymePermissions,
  getEponymeRoleOptions,
  getEponymeRoleRegistry,
  hasEponymePermission,
  resolveEponymeContentResource,
} from './eponyme-role-registry'

export async function requireEponymePermission(
  event: H3Event,
  action: EponymePermissionAction,
  resource: EponymeResource,
) {
  const user = await requireEponymeUser(event)
  if (!hasEponymePermission(user.role, action, resource))
    throw createError({ status: 403, message: t('server.forbidden') })
  return user
}
