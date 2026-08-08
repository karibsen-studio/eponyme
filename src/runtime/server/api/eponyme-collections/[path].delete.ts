import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-collections\//, ''))
  const service = useEponymeService()
  const collection = name ? splitEponymeCollectionEntry(service, name) : undefined
  // The entry moves to the trash: its content and its history are kept, and
  // `/api/eponyme-trash` can bring it back.
  if (!collection || !(await service.deleteCollectionEntry(name)))
    throw createError({ statusCode: 404, statusMessage: t('server.collectionEntryNotFound') })

  await callEponymeHook('eponyme:entry:trashed', { name, collection, userId: user.id })

  return { deleted: true }
})
