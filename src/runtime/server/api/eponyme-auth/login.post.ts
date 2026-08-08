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
    // Checked after password verification: repeated failures are throttled, while the real
    // owner can still sign in and cannot be locked out by somebody else.
    await assertEponymeRateLimit(event, `login:account-failure:${account}`, limits.loginAccountFailure)
    throw createError({ statusCode: 401, statusMessage: t('server.badCredentials') })
  }
  setEponymeSessionCookie(event, result.session.token, result.session.expiresAt)
  return { user: result.session.user }
})
