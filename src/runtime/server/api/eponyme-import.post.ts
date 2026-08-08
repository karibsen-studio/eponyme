import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, getRequestHeader, readRawBody, setResponseHeader } from 'h3'
import { useEponymeService } from '../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../utils/auth'

/** An export of a large collection is still text, but it must not be unbounded. */
const MAX_BODY_BYTES = 5 * 1024 * 1024

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  // An import overwrites content across the whole site, so it stays with owners.
  const user = await requireEponymeUser(event, { roles: ['owner'] })
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const declaredLength = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES)
    throw createError({ statusCode: 413, statusMessage: 'Import file is too large.' })

  const raw = await readRawBody(event, 'utf8')
  if (raw && Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES)
    throw createError({ statusCode: 413, statusMessage: 'Import file is too large.' })

  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : undefined
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Import file must be valid JSON.' })
  }

  // `dryRun` reports what the import would do without writing, so the dashboard can
  // show the counts before anything is overwritten.
  const dryRun = Boolean(getQuery(event).dryRun)
  const result = await useEponymeService().importContent(payload, { dryRun, actorId: user.id })
  if ('errors' in result) {
    throw createError({
      statusCode: result.schemaMismatch?.length ? 409 : 400,
      statusMessage: result.errors[0] ?? t('server.importFailed'),
      data: { errors: result.errors, schemaMismatch: result.schemaMismatch ?? [] },
    })
  }
  return result
})
