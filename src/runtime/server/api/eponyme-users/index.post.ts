import { t } from '#eponyme/locale'
import { createError, defineEventHandler, setResponseStatus } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { readEponymeBody } from '../../utils/body'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const actor = await requireEponymePermission(event, 'users.manage', { kind: 'system', name: 'users' })
  const body = await readEponymeBody<{ username?: unknown, role?: unknown }>(event)
  const created = await useEponymeAuthService().createUser(body?.username, body?.role, actor)
  if (!created.result)
    throw createError({ status: 422, message: created.error ?? t('server.userCreateFailed') })
  setResponseStatus(event, 201)
  return created.result
})
