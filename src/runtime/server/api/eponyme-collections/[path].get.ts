import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymeUser } from '../../utils/auth'
import { getEponymeCacheTags, setEponymePublicCache } from '../../utils/eponyme-cache'
import { interpolateEponymeContent, interpolateEponymeEntry } from '../../utils/eponyme-variables'
import type { EponymeFilterCondition, EponymeFilterOperators, EponymeFilterRange } from '../../services/eponyme-store'

const MAX_TAKE = 200
/** Operators a filter may use. Anything else is a typo, and is refused as one. */
const OPERATORS = ['gte', 'lte', 'gt', 'lt', 'contains', 'in', 'not'] as const
const LIST_OPERATORS = new Set(['in', 'not'])
/** `where[tags]=nuxt` and `where[publishedOn][gte]=2026-01-01`. */
const FILTER_KEY = /^where\[([^\]]+)\](?:\[([^\]]+)\])?$/

function readCount(raw: unknown, min: number, max: number): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/**
 * Repeating a key means "any of", which is what the parser already hands back as an array.
 *
 * An unknown field or operator is rejected rather than dropped, for the same reason
 * `orderBy` is: a filter that silently does nothing returns the whole collection, and the
 * caller reads that as a legitimate result.
 */
function readFilter(query: Record<string, unknown>, allowed: string[] | undefined): Record<string, EponymeFilterCondition> | undefined {
  const where: Record<string, EponymeFilterCondition> = {}
  for (const [rawKey, rawValue] of Object.entries(query)) {
    const match = FILTER_KEY.exec(rawKey)
    if (!match) continue
    const [, key, operator] = match as unknown as [string, string, string | undefined]
    if (!allowed?.includes(key)) {
      throw createError({
        statusCode: 400,
        statusMessage: t('server.unknownFilterKey', { key, keys: allowed?.join(', ') || t('server.noKeys') }),
      })
    }
    if (operator === undefined) {
      const values = (Array.isArray(rawValue) ? rawValue : [rawValue]).map(String).filter(Boolean)
      if (values.length) where[key] = values.length === 1 ? values[0]! : values
      continue
    }
    if (!(OPERATORS as readonly string[]).includes(operator)) {
      throw createError({
        statusCode: 400,
        statusMessage: t('server.unknownFilterOperator', { operator, operators: OPERATORS.join(', ') }),
      })
    }
    const existing = where[key]
    // The operators of one key accumulate, so `gte` and `lte`, or `in` and `not`, stay one
    // condition rather than the last one overwriting the others.
    const operators: EponymeFilterOperators = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
    if (LIST_OPERATORS.has(operator)) {
      const values = (Array.isArray(rawValue) ? rawValue : [rawValue]).map(String).filter(Boolean)
      if (values.length) operators[operator as 'in' | 'not'] = values
    }
    else {
      operators[operator as keyof EponymeFilterRange | 'contains'] = String(Array.isArray(rawValue) ? rawValue[0] : rawValue)
    }
    where[key] = operators
  }
  return Object.keys(where).length ? where : undefined
}

export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-collections\//, ''))
  const query = getQuery(event)
  const version = query.version === 'draft' ? 'draft' : 'published'
  // A draft listing carries unpublished titles and content. The no-store middleware keeps
  // it out of every cache, so only the published listing declares anything here.
  if (version === 'draft') await requireEponymeUser(event)
  else if (!query.raw) setEponymePublicCache(event, getEponymeCacheTags(name))
  if (!name) throw createError({ statusCode: 404, statusMessage: t('server.collectionNotFound') })

  const service = useEponymeService()
  const orderBy = query.orderBy === undefined || query.orderBy === '' ? undefined : String(query.orderBy)
  if (orderBy) {
    const allowed = service.collectionSortKeys(name)
    if (!allowed) throw createError({ statusCode: 404, statusMessage: t('server.collectionNotFound') })
    // Rejected rather than ignored, so a typo cannot return an arbitrary order the
    // caller believes is sorted.
    if (!allowed.includes(orderBy)) {
      throw createError({
        statusCode: 400,
        statusMessage: t('server.unknownSortKey', { key: orderBy, keys: allowed.join(', ') }),
      })
    }
  }

  const page = await service.listCollection(name, version, {
    take: readCount(query.take, 1, MAX_TAKE),
    skip: readCount(query.skip, 0, Number.MAX_SAFE_INTEGER),
    orderBy,
    order: query.order === 'asc' ? 'asc' : query.order === 'desc' ? 'desc' : undefined,
    where: readFilter(query, service.collectionFilterKeys(name)),
  })
  if (!page) throw createError({ statusCode: 404, statusMessage: t('server.collectionNotFound') })
  if (query.raw) return page
  // The entry's own schema is what tells rich text apart from plain text; the envelope
  // around it — a title carrying a variable — goes through the general pass as before.
  const fields = service.getCollection(name)?.fields
  return {
    ...page,
    entries: page.entries.map(entry => interpolateEponymeContent({ ...entry, data: interpolateEponymeEntry(fields, entry.data) })),
  }
})
