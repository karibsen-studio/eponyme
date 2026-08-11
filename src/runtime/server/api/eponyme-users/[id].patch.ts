import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { readEponymeBody } from '../../utils/body'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await requireEponymeUser(event, { roles: ['owner'] })
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id) throw createError({ statusCode: 404, statusMessage: t('server.userNotFound') })
  const body = await readEponymeBody<{ role?: unknown, active?: unknown }>(event)
  const result = await useEponymeAuthService().updateUser(id, body ?? {})
  if (!result.user)
    throw createError({ statusCode: result.notFound ? 404 : 422, statusMessage: result.error })
  return { user: result.user }
})
