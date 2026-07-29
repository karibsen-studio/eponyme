import { createError, defineEventHandler, getQuery, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymeUser } from '../../utils/auth'
import { interpolateEponymeContent } from '../../utils/eponyme-variables'

const MAX_TAKE = 200

function readCount(raw: unknown, min: number, max: number): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-collections\//, ''))
  const query = getQuery(event)
  const version = query.version === 'draft' ? 'draft' : 'published'
  if (version === 'draft') await requireEponymeUser(event)
  if (!name) throw createError({ statusCode: 404, statusMessage: 'Eponyme collection not found.' })

  const service = useEponymeService()
  const orderBy = query.orderBy === undefined || query.orderBy === '' ? undefined : String(query.orderBy)
  if (orderBy) {
    const allowed = service.collectionSortKeys(name)
    if (!allowed) throw createError({ statusCode: 404, statusMessage: 'Eponyme collection not found.' })
    // Rejected rather than ignored, so a typo cannot return an arbitrary order the
    // caller believes is sorted.
    if (!allowed.includes(orderBy)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown sort key "${orderBy}". Available keys: ${allowed.join(', ')}.`,
      })
    }
  }

  const page = await service.listCollection(name, version, {
    take: readCount(query.take, 1, MAX_TAKE),
    skip: readCount(query.skip, 0, Number.MAX_SAFE_INTEGER),
    orderBy,
    order: query.order === 'asc' ? 'asc' : query.order === 'desc' ? 'desc' : undefined,
  })
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Eponyme collection not found.' })
  return query.raw ? page : interpolateEponymeContent(page)
})
