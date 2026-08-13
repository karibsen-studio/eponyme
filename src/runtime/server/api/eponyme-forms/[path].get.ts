import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery } from 'h3'
import { useEponymeFormService } from '../../services/eponyme-form-service'
import { requireEponymeUser } from '../../utils/auth'
import { readEponymeFormRoute } from '../../utils/form-route'

export default defineEventHandler(async (event) => {
  await requireEponymeUser(event)
  const route = readEponymeFormRoute(event)
  if (!route?.submissions) throw createError({ statusCode: 404, statusMessage: t('server.formNotFound') })
  const service = useEponymeFormService()

  if (route.submissionId) {
    const submission = await service.getSubmission(route.name, route.submissionId)
    if (!submission) throw createError({ statusCode: 404, statusMessage: t('server.submissionNotFound') })
    return { submission }
  }

  const query = getQuery(event)
  const page = await service.listSubmissions(route.name, {
    page: Number(query.page ?? 1),
    perPage: query.perPage === undefined ? undefined : Number(query.perPage),
    search: typeof query.search === 'string' ? query.search : undefined,
  })
  if (!page) throw createError({ statusCode: 404, statusMessage: t('server.formNotFound') })
  return page
})
