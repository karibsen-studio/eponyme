import { t } from '#eponyme/locale'
import { createError, defineEventHandler, setResponseStatus } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { readEponymeBody } from '../../utils/body'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await requireEponymeUser(event, { roles: ['owner'] })
  const body = await readEponymeBody<{ username?: unknown, role?: unknown }>(event)
  const created = await useEponymeAuthService().createUser(body?.username, body?.role)
  if (!created.result)
    throw createError({ statusCode: 422, statusMessage: created.error ?? t('server.userCreateFailed') })
  setResponseStatus(event, 201)
  return created.result
})
