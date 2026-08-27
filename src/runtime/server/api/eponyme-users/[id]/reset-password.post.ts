import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useEponymeAuthService } from '../../../services/eponyme-auth-service'
import { assertEponymeMutationOrigin } from '../../../utils/auth'
import { requireEponymePermission } from '../../../utils/eponyme-permissions'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const actor = await requireEponymePermission(event, 'users.manage', { kind: 'system', name: 'users' })
  const id = getRouterParam(event, 'id', { decode: true })
  const result = id ? await useEponymeAuthService().resetPassword(id, actor) : undefined
  if (!result?.result)
    throw createError({ status: 404, message: result?.error ?? t('server.userNotFound') })
  return result.result
})
