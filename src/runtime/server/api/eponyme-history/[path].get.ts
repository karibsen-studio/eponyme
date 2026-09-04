import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymePermission, resolveEponymeContentResource } from '../../utils/eponyme-permissions'
import { readEponymeRoutePath } from '../../utils/route-path'

export default defineEventHandler(async (event) => {
  const name = readEponymeRoutePath(event, /^\/api\/eponyme-history\//)
  const resource = resolveEponymeContentResource(name)
  if (!resource) throw createError({ status: 404, message: t('server.entryNotFound') })
  await requireEponymePermission(event, 'content.read', resource)
  const requestedLimit = Number(getQuery(event).limit ?? 50)
  const history = name ? await useEponymeService().history(name, Number.isFinite(requestedLimit) ? requestedLimit : 50) : undefined
  if (!history) throw createError({ status: 404, message: t('server.entryNotFound') })
  return { history }
})
