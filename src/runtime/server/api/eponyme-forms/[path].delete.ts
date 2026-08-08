import { t } from '#eponyme/locale'
import { createError, defineEventHandler } from 'h3'
import { useEponymeFormService } from '../../services/eponyme-form-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { readEponymeFormRoute } from '../../utils/form-route'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const route = readEponymeFormRoute(event)
  if (!route?.submissions) throw createError({ statusCode: 404, statusMessage: t('server.submissionNotFound') })
  const service = useEponymeFormService()

  // Without an id the whole form is cleared, which is what the dashboard's
  // "Clear all" action calls.
  if (!route.submissionId) {
    const deleted = await service.deleteAllSubmissions(route.name)
    if (deleted === undefined) throw createError({ statusCode: 404, statusMessage: t('server.formNotFound') })
    return { deleted }
  }

  if (!await service.deleteSubmission(route.name, route.submissionId))
    throw createError({ statusCode: 404, statusMessage: t('server.submissionNotFound') })
  return { deleted: true }
})
