import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery } from 'h3'
import { useEponymeFormService } from '../../services/eponyme-form-service'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { readEponymeFormRoute } from '../../utils/form-route'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

export default defineEventHandler(async (event) => {
  const route = readEponymeFormRoute(event)
  if (!route?.submissions) throw createError({ status: 404, message: t('server.formNotFound') })
  const user = await requireEponymePermission(event, 'submissions.read', { kind: 'form', name: route.name })
  const service = useEponymeFormService()
  // A submission carries what a visitor typed, contact details included: reading it is worth a trace, the
  // same way deleting one already is.
  await recordEponymeAudit(event, {
    actor: user,
    action: 'submissions.read',
    resourceType: 'form',
    resourceName: route.name,
    metadata: route.submissionId ? { submissionId: route.submissionId } : null,
  })

  if (route.submissionId) {
    const submission = await service.getSubmission(route.name, route.submissionId)
    if (!submission) throw createError({ status: 404, message: t('server.submissionNotFound') })
    return { submission }
  }

  const query = getQuery(event)
  const page = await service.listSubmissions(route.name, {
    page: Number(query.page ?? 1),
    perPage: query.perPage === undefined ? undefined : Number(query.perPage),
    search: typeof query.search === 'string' ? query.search : undefined,
  })
  if (!page) throw createError({ status: 404, message: t('server.formNotFound') })
  return page
})
