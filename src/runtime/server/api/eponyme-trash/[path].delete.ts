import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-trash\//, ''))
  const service = useEponymeService()
  const collection = name ? splitEponymeCollectionEntry(service, name) : undefined
  if (!collection)
    throw createError({ status: 404, message: t('server.trashedNotFound') })
  const user = await requireEponymePermission(event, 'content.purge', { kind: 'collection', name: collection.name })
  if (!(await service.purgeCollectionEntry(name, user)))
    throw createError({ status: 404, message: t('server.trashedNotFound') })

  await callEponymeHook('eponyme:entry:purged', { name, collection, userId: user.id })

  return { purged: true }
})
