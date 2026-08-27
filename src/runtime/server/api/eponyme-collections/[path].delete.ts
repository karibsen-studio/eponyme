import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-collections\//, ''))
  const service = useEponymeService()
  const collection = name ? splitEponymeCollectionEntry(service, name) : undefined
  if (!collection) throw createError({ status: 404, message: t('server.collectionEntryNotFound') })
  const user = await requireEponymePermission(event, 'content.trash', { kind: 'collection', name: collection.name })

  const result = await service.deleteCollectionEntry(name, user)
  if (!result) throw createError({ status: 404, message: t('server.collectionEntryNotFound') })
  // Refused rather than left to break: the entries holding the reference are named, so the
  // editor knows exactly what to detach first.
  if ('referencedBy' in result) {
    throw createError({
      status: 409,
      message: t('server.entryReferenced', { entries: result.referencedBy.join(', ') }),
      data: { referencedBy: result.referencedBy },
    })
  }

  await callEponymeHook('eponyme:entry:trashed', { name, collection, userId: user.id })

  return { deleted: true }
})
