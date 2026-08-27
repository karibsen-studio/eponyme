import { t } from '#eponyme/locale'
import { createError, defineEventHandler } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { normalizeUsername } from '../../services/eponyme-auth-store'
import { assertEponymeMutationOrigin, setEponymeSessionCookie } from '../../utils/auth'
import { EPONYME_LOGIN_BODY_BYTES, readEponymeBody } from '../../utils/body'
import {
  assertEponymeRateLimit,
  eponymeRequestClientKey,
  eponymeRateLimitPolicies,
} from '../../utils/rate-limit'
import { getEponymePermissions } from '../../utils/eponyme-permissions'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const body = await readEponymeBody<{ username?: unknown, password?: unknown }>(event, EPONYME_LOGIN_BODY_BYTES)
  const client = eponymeRequestClientKey(event)
  const limits = eponymeRateLimitPolicies()
  await assertEponymeRateLimit(event, `login:ip:${client}`, limits.loginIp)
  await assertEponymeRateLimit(event, 'login:global', limits.loginGlobal)
  const result = await useEponymeAuthService().login(body?.username, body?.password)
  if (!result.ok) {
    const account = typeof body?.username === 'string' ? normalizeUsername(body.username) : 'invalid-account'
    await recordEponymeAudit(event, {
      actorUsername: account,
      action: 'auth.login.failed',
      outcome: 'failure',
      resourceType: 'system',
      resourceName: 'authentication',
      connection: true,
      metadata: result.reason === 'role' ? { reason: 'role' } : null,
    })

    if (result.reason === 'role')
      throw createError({ status: 403, message: t('server.roleUnavailable') })
    await assertEponymeRateLimit(event, `login:account-failure:${account}`, limits.loginAccountFailure)
    throw createError({ status: 401, message: t('server.badCredentials') })
  }
  setEponymeSessionCookie(event, result.session.token, result.session.expiresAt)
  await recordEponymeAudit(event, {
    actor: result.session.user,
    action: 'auth.login.succeeded',
    resourceType: 'system',
    resourceName: 'authentication',
    connection: true,
  })
  return {
    user: result.session.user,
    permissions: getEponymePermissions(result.session.user.role),
  }
})
