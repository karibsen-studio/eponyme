import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { readEponymeBody } from '../../utils/body'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const actor = await requireEponymePermission(event, 'users.manage', { kind: 'system', name: 'users' })
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id) throw createError({ status: 404, message: t('server.userNotFound') })
  const body = await readEponymeBody<{ role?: unknown, active?: unknown }>(event)
  const result = await useEponymeAuthService().updateUser(id, body ?? {}, actor)
  if (!result.user)
    throw createError({ status: result.notFound ? 404 : 422, message: result.error })
  return { user: result.user }
})
