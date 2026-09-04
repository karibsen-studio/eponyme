import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, setResponseStatus } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission, resolveEponymeContentResource } from '../../utils/eponyme-permissions'
import { callEponymeBlockingHook, callEponymeHook } from '../../utils/eponyme-hooks'
import { readEponymeBody } from '../../utils/body'
import { readEponymeRevision } from '../../utils/eponyme-revision'
import { splitEponymeCollectionEntry } from '../../utils/eponyme-entry'
import { isEponymePublicationEnabled } from '../../../utils/eponyme-publication'
import { readEponymeRoutePath } from '../../utils/route-path'
import type { EponymePublicationOption } from '../../../utils/eponyme-publication'
import type { EponymeAction } from '../../services/eponyme-store'

const actions = ['draft', 'publish', 'unpublish', 'revertToDraft', 'schedule', 'unschedule'] as const satisfies readonly EponymeAction[]

const publicationActions = ['unpublish', 'revertToDraft', 'schedule'] as const satisfies readonly EponymeAction[]
const hookByAction = {
  draft: 'eponyme:entry:saved',
  publish: 'eponyme:entry:published',
  unpublish: 'eponyme:entry:unpublished',
  revertToDraft: 'eponyme:entry:unpublished',
  schedule: 'eponyme:entry:scheduled',
  unschedule: 'eponyme:entry:unscheduled',
} as const
const permissionByAction = {
  draft: 'content.update',
  publish: 'content.publish',
  unpublish: 'content.unpublish',
  revertToDraft: 'content.unpublish',
  schedule: 'content.schedule',
  unschedule: 'content.schedule',
} as const

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const name = readEponymeRoutePath(event, /^\/api\/eponyme\//)
  if (!name) throw createError({ status: 404, message: t('server.entryNotFound') })

  const requestedAction = getQuery(event).action
  if (requestedAction !== undefined && (typeof requestedAction !== 'string' || !actions.includes(requestedAction as EponymeAction)))
    throw createError({ status: 400, message: t('server.invalidAction') })
  const action: EponymeAction = (requestedAction as EponymeAction | undefined) ?? 'draft'
  const service = useEponymeService()
  const collection = splitEponymeCollectionEntry(service, name)
  const resource = resolveEponymeContentResource(name)
  if (!resource) throw createError({ status: 404, message: t('server.entryNotFound') })
  const user = await requireEponymePermission(event, permissionByAction[action], resource)

  if ((publicationActions as readonly EponymeAction[]).includes(action)) {
    const options = useRuntimeConfig().public.eponyme as { publication?: EponymePublicationOption }
    const definition = collection ? service.getCollection(collection.name) : undefined
    const enabled = isEponymePublicationEnabled(
      options.publication,
      name,
      collection && { name: collection.name, publication: definition?.publication },
    )
    if (!enabled) throw createError({ status: 422, message: t('server.publicationDisabled') })
  }

  const body = await readEponymeBody(event)
  if (action !== 'draft' && hasLifecycleContent(body, action))
    throw createError({ status: 400, message: t('server.lifecycleContentForbidden') })
  const scheduleBody = action === 'schedule' && isObject(body) ? body : undefined
  const current = action === 'draft' ? undefined : await service.getResult(name, 'draft')
  const data = action === 'draft' ? body : current?.data
  if (!data) throw createError({ status: 404, message: t('server.entryNotFound') })
  // Listeners may amend `data` here, so the hook runs on the payload that will be written rather than on a
  // copy of it.
  const beforeSave = { name, collection, action, data: data as Record<string, unknown>, userId: user.id }
  await callEponymeBlockingHook('eponyme:entry:beforeSave', beforeSave)

  // Optional: a caller that never read a revision - a public read, a script - keeps writing
  // last-write-wins.
  const result = await service.patch(name, action === 'draft' ? beforeSave.data : {}, action, user, {
    scheduledPublishAt: typeof scheduleBody?.scheduledPublishAt === 'string' ? scheduleBody.scheduledPublishAt : null,
    scheduledUnpublishAt: typeof scheduleBody?.scheduledUnpublishAt === 'string' ? scheduleBody.scheduledUnpublishAt : null,
  }, readEponymeRevision(event))
  if (!result) throw createError({ status: 404, message: t('server.entryNotFound') })
  if ('conflict' in result && result.conflict)
    throw createError({ status: 409, message: t('server.entryConflict') })
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

function hasLifecycleContent(value: unknown, action: EponymeAction): boolean {
  if (value == null) return false
  if (!isObject(value)) return true
  const allowed = action === 'schedule'
    ? new Set(['scheduledPublishAt', 'scheduledUnpublishAt'])
    : new Set<string>()
  return Object.keys(value).some(key => !allowed.has(key))
}
