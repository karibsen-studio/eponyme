import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useEponymeAuthService } from '../../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await requireEponymeUser(event, { roles: ['owner'] })
  const id = getRouterParam(event, 'id', { decode: true })
  const result = id ? await useEponymeAuthService().resetPassword(id) : undefined
  if (!result?.result)
    throw createError({ statusCode: 404, statusMessage: result?.error ?? t('server.userNotFound') })
  return result.result
})
