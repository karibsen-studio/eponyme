import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymePermission, resolveEponymeContentResource } from '../../utils/eponyme-permissions'
import { getEponymeCacheTags, setEponymePublicCache } from '../../utils/eponyme-cache'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'
import { interpolateEponymeEntry } from '../../utils/eponyme-variables'
import { readEponymeRoutePath } from '../../utils/route-path'
import type { EponymeVersionSelector } from '../../services/eponyme-store'

/** `draft`, `published`, or a numeric version id taken from the history. */
function readVersion(raw: unknown): EponymeVersionSelector {
  if (raw === 'draft') return 'draft'
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : 'published'
}

export default defineEventHandler(async (event) => {
  const name = readEponymeRoutePath(event, /^\/api\/eponyme\//)
  const requestedVersion = getQuery(event).version
  const version = readVersion(requestedVersion)
  // Anything other than the published content is unreleased material and needs a session.
  const raw = Boolean(getQuery(event).raw)
  const resource = resolveEponymeContentResource(name)
  if (version !== 'published') {
    if (!resource) throw createError({ status: 404, message: t('server.entryNotFound') })
    await requireEponymePermission(event, 'content.read', resource)
  }
  // `raw` is the dashboard editor asking for the unresolved source text: the same published content, but
  // not what a public page renders, so it stays out of the shared cache.
  else if (!raw) setEponymePublicCache(event, getEponymeCacheTags(name, splitEponymeCollectionEntry(useEponymeService(), name)?.name))
  const result = name ? await useEponymeService().getResult(name, version) : undefined
  if (!result) throw createError({ status: 404, message: t('server.entryNotFound') })
  // `raw=1` is what the dashboard editor asks for: it must show `{{ currentYear }}` so the variable stays
  // editable instead of being replaced by its value.
  const data = raw ? result.data : interpolateEponymeEntry(useEponymeService().getSchema(name), result.data)
  return requestedVersion ? { ...result, data } : { data }
})
