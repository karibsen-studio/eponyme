import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const path = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-history\//, ''))
  const match = path.match(/^(.+)\/(\d+)$/)
  if (!match) throw createError({ statusCode: 400, statusMessage: t('server.versionIdRequired') })
  const [, name, rawVersionId] = match
  const versionId = Number(rawVersionId)
  if (!Number.isSafeInteger(versionId)) throw createError({ statusCode: 404, statusMessage: t('server.versionNotFound') })
  const service = useEponymeService()
  const result = await service.restore(name!, versionId, user.id)
  if (!result) throw createError({ statusCode: 404, statusMessage: t('server.versionNotFound') })
  if ('conflict' in result)
    throw createError({ statusCode: 409, statusMessage: t('server.entryConflict') })

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
