import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const path = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-history\//, ''))
  const match = path.match(/^(.+)\/(\d+)$/)
  if (!match) throw createError({ statusCode: 400, statusMessage: 'A valid version id is required.' })
  const [, name, rawVersionId] = match
  const versionId = Number(rawVersionId)
  if (!Number.isSafeInteger(versionId)) throw createError({ statusCode: 404, statusMessage: 'Eponyme version not found.' })
  const result = await useEponymeService().restore(name!, versionId, user.id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Eponyme version not found.' })
  if ('conflict' in result && result.conflict)
    throw createError({ statusCode: 409, message: 'This entry was changed by someone else. Reload the page to get the latest version.' })
  return result
})
