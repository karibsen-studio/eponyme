import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await requireEponymeUser(event, { roles: ['owner'] })
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id) throw createError({ statusCode: 404, message: 'User not found.' })
  const body = await readBody<{ role?: unknown, active?: unknown }>(event)
  const result = await useEponymeAuthService().updateUser(id, body ?? {})
  if (!result.user)
    throw createError({ statusCode: result.notFound ? 404 : 422, message: result.error })
  return { user: result.user }
})
