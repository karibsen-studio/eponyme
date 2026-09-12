import { t } from '#eponyme/locale'
import { createError, defineEventHandler } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import {
  assertEponymeMutationOrigin,
  requireEponymeUser,
  setEponymeSessionCookie,
} from '../../utils/auth'
import { EPONYME_LOGIN_BODY_BYTES, readEponymeBody } from '../../utils/body'
import {
  assertEponymeRateLimit,
  eponymeRateLimitPolicies,
  eponymeRequestClientKey,
} from '../../utils/rate-limit'
import { getEponymePermissions } from '../../utils/eponyme-permissions'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { allowPasswordChangeRequired: true })
  // The login counts its attempts; this route hashes a password too, and a stolen session could otherwise
  // guess the current one here without ever meeting that counter.
  const limits = eponymeRateLimitPolicies()
  await assertEponymeRateLimit(event, `password-change:account:${user.id}`, limits.passwordChangeAccount)
  await assertEponymeRateLimit(event, `password-change:ip:${eponymeRequestClientKey(event)}`, limits.passwordChangeIp)
  const body = await readEponymeBody<{ currentPassword?: unknown, newPassword?: unknown }>(event, EPONYME_LOGIN_BODY_BYTES)
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
