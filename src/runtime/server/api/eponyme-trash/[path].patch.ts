import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-trash\//, ''))
  const service = useEponymeService()
  const collection = name ? splitEponymeCollectionEntry(service, name) : undefined
  if (!collection || !(await service.restoreCollectionEntry(name)))
    throw createError({ statusCode: 404, statusMessage: t('server.trashedNotFound') })

  await callEponymeHook('eponyme:entry:untrashed', { name, collection, userId: user.id })

  return { restored: true }
})
