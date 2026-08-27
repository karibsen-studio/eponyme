import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery } from 'h3'
import { useEponymeFormService } from '../../services/eponyme-form-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { readEponymeFormRoute } from '../../utils/form-route'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

function readSubmissionIds(raw: unknown): string[] | undefined {
  const values = (Array.isArray(raw) ? raw : [raw]).flatMap(value => typeof value === 'string' ? value.split(',') : [])
  const ids = values.map(value => value.trim()).filter(Boolean)
  return ids.length ? ids : undefined
}

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const route = readEponymeFormRoute(event)
  if (!route?.submissions) throw createError({ status: 404, message: t('server.submissionNotFound') })
  const user = await requireEponymePermission(event, 'submissions.delete', { kind: 'form', name: route.name })
  const service = useEponymeFormService()

  if (!route.submissionId) {
    const ids = readSubmissionIds(getQuery(event).ids)
    const deleted = ids ? await service.deleteSubmissions(route.name, ids) : await service.deleteAllSubmissions(route.name)
    if (deleted === undefined) throw createError({ status: 404, message: t('server.formNotFound') })
    await recordEponymeAudit(event, {
      actor: user,
      action: ids ? 'submissions.selection_deleted' : 'submissions.cleared',
      resourceType: 'form',
      resourceName: route.name,
      metadata: { deleted },
    })
    return { deleted }
  }

  if (!await service.deleteSubmission(route.name, route.submissionId))
    throw createError({ status: 404, message: t('server.submissionNotFound') })
  await recordEponymeAudit(event, {
    actor: user,
    action: 'submission.deleted',
    resourceType: 'form',
    resourceName: route.name,
    metadata: { submissionId: route.submissionId },
  })
  return { deleted: true }
})
