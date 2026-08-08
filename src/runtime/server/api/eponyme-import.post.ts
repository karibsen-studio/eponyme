import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { useEponymeService } from '../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../utils/auth'
import { readEponymeRawBody } from '../utils/body'

/** An export of a large collection is still text, but it must not be unbounded. */
const MAX_BODY_BYTES = 5 * 1024 * 1024

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  // An import overwrites content across the whole site, so it stays with owners.
  const user = await requireEponymeUser(event, { roles: ['owner'] })
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const raw = await readEponymeRawBody(event, MAX_BODY_BYTES, t('server.importTooLarge'))

  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : undefined
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: t('server.importInvalidJson') })
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
