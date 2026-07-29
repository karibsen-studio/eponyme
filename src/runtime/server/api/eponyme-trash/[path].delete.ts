import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  // The only irreversible content operation, so it is kept to owners.
  const user = await requireEponymeUser(event, { roles: ['owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-trash\//, ''))
  const service = useEponymeService()
  const collection = name ? splitEponymeCollectionEntry(service, name) : undefined
  if (!collection || !(await service.purgeCollectionEntry(name)))
    throw createError({ statusCode: 404, statusMessage: 'Eponyme trashed entry not found.' })

  await callEponymeHook('eponyme:entry:purged', { name, collection, userId: user.id })

  return { purged: true }
})
