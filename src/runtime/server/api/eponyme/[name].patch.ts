import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, getRequestURL, readBody, setResponseStatus } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { callEponymeBlockingHook, callEponymeHook } from '../../utils/eponyme-hooks'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'
import type { EponymeAction } from '../../services/eponyme-store'

const actions = ['draft', 'publish', 'unpublish', 'revertToDraft', 'schedule', 'unschedule'] as const satisfies readonly EponymeAction[]
const hookByAction = {
  draft: 'eponyme:entry:saved',
  publish: 'eponyme:entry:published',
  unpublish: 'eponyme:entry:unpublished',
  revertToDraft: 'eponyme:entry:unpublished',
  schedule: 'eponyme:entry:scheduled',
  unschedule: 'eponyme:entry:unscheduled',
} as const

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme\//, ''))
  if (!name) throw createError({ statusCode: 404, statusMessage: t('server.entryNotFound') })

  const requestedAction = getQuery(event).action
  if (requestedAction !== undefined && (typeof requestedAction !== 'string' || !actions.includes(requestedAction as EponymeAction)))
    throw createError({ statusCode: 400, statusMessage: t('server.invalidAction') })
  const action: EponymeAction = (requestedAction as EponymeAction | undefined) ?? 'publish'
  const service = useEponymeService()
  const collection = splitEponymeCollectionEntry(service, name)

  const body = await readBody(event)
  const scheduleBody = action === 'schedule' && isObject(body) ? body : undefined
  const data = scheduleBody && isObject(scheduleBody.data) ? scheduleBody.data : body
  // Listeners may amend `data` here, so the hook runs on the payload that will be
  // written rather than on a copy of it.
  const beforeSave = { name, collection, action, data: data as Record<string, unknown>, userId: user.id }
  await callEponymeBlockingHook('eponyme:entry:beforeSave', beforeSave)

  const result = await service.patch(name, beforeSave.data, action, user.id, {
    scheduledPublishAt: typeof scheduleBody?.scheduledPublishAt === 'string' ? scheduleBody.scheduledPublishAt : null,
    scheduledUnpublishAt: typeof scheduleBody?.scheduledUnpublishAt === 'string' ? scheduleBody.scheduledUnpublishAt : null,
  })
  if (!result) throw createError({ statusCode: 404, statusMessage: t('server.entryNotFound') })
  if ('conflict' in result && result.conflict)
    throw createError({ statusCode: 409, message: 'This entry was changed by someone else. Reload the page to get the latest version.' })
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }

  await callEponymeHook(hookByAction[action], {
    name,
    collection,
    action,
    status: result.status,
    publishedAt: result.publishedAt,
    scheduledPublishAt: result.scheduledPublishAt,
    scheduledUnpublishAt: result.scheduledUnpublishAt,
    data: result.data,
    userId: user.id,
  })

  return requestedAction ? result : { data: result.data }
})

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
