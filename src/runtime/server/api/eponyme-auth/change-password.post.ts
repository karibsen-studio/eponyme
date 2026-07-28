import { createError, defineEventHandler, readBody } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import {
  assertEponymeMutationOrigin,
  requireEponymeUser,
  setEponymeSessionCookie,
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { allowPasswordChangeRequired: true })
  const body = await readBody<{ currentPassword?: unknown, newPassword?: unknown }>(event)
  const result = await useEponymeAuthService().changePassword(
    user.id,
    body?.currentPassword,
    body?.newPassword,
  )
  if (!result.session)
    throw createError({ statusCode: 422, statusMessage: result.error ?? 'Unable to change password.' })
  setEponymeSessionCookie(event, result.session.token, result.session.expiresAt)
  return { user: result.session.user }
})
