import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await requireEponymeUser(event, { roles: ['owner'] })
  const body = await readBody<{ username?: unknown, role?: unknown }>(event)
  const created = await useEponymeAuthService().createUser(body?.username, body?.role)
  if (!created.result)
    throw createError({ statusCode: 422, statusMessage: created.error ?? 'Unable to create user.' })
  setResponseStatus(event, 201)
  return created.result
})
