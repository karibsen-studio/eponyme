import { createError, defineEventHandler, getQuery, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireEponymeUser(event)
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-history\//, ''))
  const requestedLimit = Number(getQuery(event).limit ?? 50)
  const history = name ? await useEponymeService().history(name, Number.isFinite(requestedLimit) ? requestedLimit : 50) : undefined
  if (!history) throw createError({ statusCode: 404, statusMessage: 'Eponyme entry not found.' })
  return { history }
})
