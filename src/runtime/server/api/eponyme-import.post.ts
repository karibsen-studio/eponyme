import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { useEponymeService } from '../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../utils/auth'
import { requireEponymePermission } from '../utils/eponyme-permissions'
import { readEponymeRawBody } from '../utils/body'

/** An export of a large collection is still text, but it must not be unbounded. */
const MAX_BODY_BYTES = 5 * 1024 * 1024

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymePermission(event, 'content.import', { kind: 'system', name: 'content' })
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const raw = await readEponymeRawBody(event, MAX_BODY_BYTES, t('server.importTooLarge'))

  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : undefined
  }
  catch {
    throw createError({ status: 400, message: t('server.importInvalidJson') })
  }

  // `dryRun` reports what the import would do without writing, so the dashboard can
  // show the counts before anything is overwritten.
  const dryRun = Boolean(getQuery(event).dryRun)
  const result = await useEponymeService().importContent(payload, {
    dryRun,
    actorId: user.id,
    actorUsername: user.username,
  })
  if ('errors' in result) {
    throw createError({
      status: result.schemaMismatch?.length ? 409 : 400,
      message: result.errors[0] ?? t('server.importFailed'),
      data: { errors: result.errors, schemaMismatch: result.schemaMismatch ?? [] },
    })
  }
  return result
})
