import { createError, defineEventHandler, getQuery, getRequestURL, setResponseHeader } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymeUser } from '../../utils/auth'
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
  // Anything other than the published content is unreleased material: session
  // required, and no cache may ever hold on to it.
  if (version !== 'published') {
    await requireEponymeUser(event)
    setResponseHeader(event, 'Cache-Control', 'no-store')
  }
  const result = name ? await useEponymeService().getResult(name, version) : undefined
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Eponyme entry not found.' })
  // `raw=1` is what the dashboard editor asks for: it must show `{{ currentYear }}`
  // so the variable stays editable instead of being replaced by its value.
  const data = getQuery(event).raw ? result.data : interpolateEponymeContent(result.data)
  return requestedVersion ? { ...result, data } : { data }
})
