import { createError, defineEventHandler, getQuery, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-collections\//, ''))
  const version = getQuery(event).version === 'draft' ? 'draft' : 'published'
  if (version === 'draft') await requireEponymeUser(event)
  const entries = name ? await useEponymeService().listCollection(name, version) : undefined
  if (!entries) throw createError({ statusCode: 404, statusMessage: 'Eponyme collection not found.' })
  return { entries }
})
