import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-collections\//, ''))
  if (!name || !(await useEponymeService().deleteCollectionEntry(name)))
    throw createError({ statusCode: 404, statusMessage: 'Eponyme collection entry not found.' })
  return { deleted: true }
})
