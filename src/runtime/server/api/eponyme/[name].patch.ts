import { createError, defineEventHandler, getQuery, getRequestURL, readBody, setResponseStatus } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { callEponymeBlockingHook, callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'
import type { EponymeAction } from '../../services/eponyme-store'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme\//, ''))
  if (!name) throw createError({ statusCode: 404, statusMessage: 'Eponyme entry not found.' })

  const requestedAction = getQuery(event).action
  const action: EponymeAction = requestedAction === 'draft' ? 'draft' : 'publish'
  const service = useEponymeService()
  const collection = splitEponymeCollectionEntry(service, name)

  const body = await readBody(event)
  // Listeners may amend `data` here, so the hook runs on the payload that will be
  // written rather than on a copy of it.
  const beforeSave = { name, collection, action, data: body as Record<string, unknown>, userId: user.id }
  await callEponymeBlockingHook('eponyme:entry:beforeSave', beforeSave)

  const result = await service.patch(name, beforeSave.data, action, user.id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Eponyme entry not found.' })
  if ('conflict' in result && result.conflict)
    throw createError({ statusCode: 409, message: 'This entry was changed by someone else. Reload the page to get the latest version.' })
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }

  await callEponymeHook(action === 'publish' ? 'eponyme:entry:published' : 'eponyme:entry:saved', {
    name,
    collection,
    action,
    status: result.status,
    publishedAt: result.publishedAt,
    data: result.data,
    userId: user.id,
  })

  return requestedAction ? result : { data: result.data }
})
