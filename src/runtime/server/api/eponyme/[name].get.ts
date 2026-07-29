import { createError, defineEventHandler, getQuery, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymeUser } from '../../utils/auth'
import { setEponymePublicCache } from '../../utils/eponyme-cache'
import { interpolateEponymeContent } from '../../utils/eponyme-variables'
import type { EponymeVersionSelector } from '../../services/eponyme-store'

/** `draft`, `published`, or a numeric version id taken from the history. */
function readVersion(raw: unknown): EponymeVersionSelector {
  if (raw === 'draft') return 'draft'
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : 'published'
}

export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme\//, ''))
  const requestedVersion = getQuery(event).version
  const version = readVersion(requestedVersion)
  // Anything other than the published content is unreleased material and needs a session.
  // The no-store middleware already holds it out of every cache, so only the cacheable
  // case has anything to declare here.
  const raw = Boolean(getQuery(event).raw)
  if (version !== 'published') await requireEponymeUser(event)
  // `raw` is the dashboard editor asking for the unresolved source text: the same published
  // content, but not what a public page renders, so it stays out of the shared cache.
  else if (!raw) setEponymePublicCache(event)
  const result = name ? await useEponymeService().getResult(name, version) : undefined
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Eponyme entry not found.' })
  // `raw=1` is what the dashboard editor asks for: it must show `{{ currentYear }}`
  // so the variable stays editable instead of being replaced by its value.
  const data = raw ? result.data : interpolateEponymeContent(result.data)
  return requestedVersion ? { ...result, data } : { data }
})
