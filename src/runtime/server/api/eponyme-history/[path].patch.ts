import { t } from '#eponyme/locale'
import { createError, defineEventHandler, setResponseStatus } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { hasEponymePermission, requireEponymePermission, resolveEponymeContentResource } from '../../utils/eponyme-permissions'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'
import { requireEponymeRevision } from '../../utils/eponyme-revision'
import { readEponymeRoutePath } from '../../utils/route-path'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const path = readEponymeRoutePath(event, /^\/api\/eponyme-history\//)
  const match = path.match(/^(.+)\/(\d+)$/)
  if (!match) throw createError({ status: 400, message: t('server.versionIdRequired') })
  const [, name, rawVersionId] = match
  const versionId = Number(rawVersionId)
  if (!Number.isSafeInteger(versionId)) throw createError({ status: 404, message: t('server.versionNotFound') })
  const resource = resolveEponymeContentResource(name!)
  if (!resource) throw createError({ status: 404, message: t('server.entryNotFound') })
  const user = await requireEponymePermission(event, 'content.restore', resource)
  const service = useEponymeService()
  // Restoring a published version puts content back on the site, so it asks for the rights that
  // publishing it by hand would have asked for.
  const result = await service.restore(name!, versionId, user, requireEponymeRevision(event), {
    allows: action => hasEponymePermission(user.role, action, resource),
  })
  if (!result) throw createError({ status: 404, message: t('server.versionNotFound') })
  if ('conflict' in result)
    throw createError({ status: 409, message: t('server.entryConflict') })
  if ('forbidden' in result)
    throw createError({ status: 403, message: t('server.forbidden') })
  if ('errors' in result && result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }

  await callEponymeHook('eponyme:entry:restored', {
    name: name!,
    collection: splitEponymeCollectionEntry(service, name!),
    action: 'restore',
    status: result.status,
    publishedAt: result.publishedAt,
    scheduledPublishAt: result.scheduledPublishAt,
    scheduledUnpublishAt: result.scheduledUnpublishAt,
    data: result.data,
    userId: user.id,
  })

  return result
})
