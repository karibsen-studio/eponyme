import { t } from '#eponyme/locale'
import { createError, defineEventHandler } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import {
  assertEponymeMutationOrigin,
  requireEponymeUser,
  setEponymeSessionCookie,
} from '../../utils/auth'
import { readEponymeBody } from '../../utils/body'
import { getEponymePermissions } from '../../utils/eponyme-permissions'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { allowPasswordChangeRequired: true })
  const body = await readEponymeBody<{ currentPassword?: unknown, newPassword?: unknown }>(event)
  const result = await useEponymeAuthService().changePassword(
    user.id,
    body?.currentPassword,
    body?.newPassword,
  )
  if (!result.session)
    throw createError({ status: 422, message: result.error ?? t('server.passwordChangeFailed') })
  setEponymeSessionCookie(event, result.session.token, result.session.expiresAt)
  await recordEponymeAudit(event, {
    actor: result.session.user,
    action: 'auth.password_changed',
    resourceType: 'system',
    resourceName: 'authentication',
  })
  return {
    user: result.session.user,
    permissions: getEponymePermissions(result.session.user.role),
  }
})
