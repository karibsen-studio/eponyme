import { t } from '#eponyme/locale'
import { createError, defineEventHandler, setResponseStatus } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { hasEponymePermission, requireEponymePermission } from '../../utils/eponyme-permissions'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'
import { requireEponymeRevision } from '../../utils/eponyme-revision'
import { readEponymeRoutePath } from '../../utils/route-path'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const name = readEponymeRoutePath(event, /^\/api\/eponyme-trash\//)
  const service = useEponymeService()
  const collection = name ? splitEponymeCollectionEntry(service, name) : undefined
  if (!collection)
    throw createError({ status: 404, message: t('server.trashedNotFound') })
  const resource = { kind: 'collection' as const, name: collection.name }
  const user = await requireEponymePermission(event, 'content.restore', resource)
  // An entry trashed while published comes back public, which is a publication of its own.
  const result = await service.restoreCollectionEntry(name, user, requireEponymeRevision(event), {
    allows: action => hasEponymePermission(user.role, action, resource),
  })
  if (typeof result !== 'boolean') {
    if ('conflict' in result) throw createError({ status: 409, message: t('server.entryConflict') })
    if ('forbidden' in result) throw createError({ status: 403, message: t('server.forbidden') })
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }
  if (!result)
    throw createError({ status: 404, message: t('server.trashedNotFound') })

  await callEponymeHook('eponyme:entry:untrashed', { name, collection, userId: user.id })

  return { restored: true }
})
