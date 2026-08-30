import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission, resolveEponymeContentResource } from '../../utils/eponyme-permissions'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'
import { requireEponymeRevision } from '../../utils/eponyme-revision'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const path = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-history\//, ''))
  const match = path.match(/^(.+)\/(\d+)$/)
  if (!match) throw createError({ status: 400, message: t('server.versionIdRequired') })
  const [, name, rawVersionId] = match
  const versionId = Number(rawVersionId)
  if (!Number.isSafeInteger(versionId)) throw createError({ status: 404, message: t('server.versionNotFound') })
  const resource = resolveEponymeContentResource(name!)
  if (!resource) throw createError({ status: 404, message: t('server.entryNotFound') })
  const user = await requireEponymePermission(event, 'content.restore', resource)
  const service = useEponymeService()
  const result = await service.restore(name!, versionId, user, requireEponymeRevision(event))
  if (!result) throw createError({ status: 404, message: t('server.versionNotFound') })
  if ('conflict' in result)
    throw createError({ status: 409, message: t('server.entryConflict') })

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
