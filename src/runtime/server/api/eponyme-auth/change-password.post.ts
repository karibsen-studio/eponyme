import { t } from '#eponyme/locale'
import { createError, defineEventHandler } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import {
  assertEponymeMutationOrigin,
  requireEponymeUser,
  setEponymeSessionCookie,
} from '../../utils/auth'
import { readEponymeBody } from '../../utils/body'

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
    throw createError({ statusCode: 422, statusMessage: result.error ?? t('server.passwordChangeFailed') })
  setEponymeSessionCookie(event, result.session.token, result.session.expiresAt)
  return { user: result.session.user }
})
