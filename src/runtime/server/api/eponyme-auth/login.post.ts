import { createError, defineEventHandler, readBody } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin, setEponymeSessionCookie } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const body = await readBody<{ username?: unknown, password?: unknown }>(event)
  const result = await useEponymeAuthService().login(body?.username, body?.password)
  if (!result.ok)
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password.' })
  setEponymeSessionCookie(event, result.session.token, result.session.expiresAt)
  return { user: result.session.user }
})
