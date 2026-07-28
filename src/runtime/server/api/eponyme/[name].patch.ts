import { createError, defineEventHandler, getQuery, getRequestURL, readBody, setResponseStatus } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme\//, ''))
  if (!name) throw createError({ statusCode: 404, statusMessage: 'Eponyme entry not found.' })

  const requestedAction = getQuery(event).action
  const action = requestedAction === 'draft' ? 'draft' : 'publish'
  const result = await useEponymeService().patch(name, await readBody(event), action, user.id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Eponyme entry not found.' })
  if ('conflict' in result && result.conflict)
    throw createError({ statusCode: 409, message: 'This entry was changed by someone else. Reload the page to get the latest version.' })
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }
  return requestedAction ? result : { data: result.data }
})
