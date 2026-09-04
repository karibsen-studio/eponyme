import { t } from '#eponyme/locale'
import { createError, defineEventHandler, setResponseStatus } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { readEponymeBody } from '../../utils/body'
import { readEponymeRoutePath } from '../../utils/route-path'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const name = readEponymeRoutePath(event, /^\/api\/eponyme-collections\//)
  const user = await requireEponymePermission(event, 'content.create', { kind: 'collection', name })
  const result = name ? await useEponymeService().createCollectionEntry(name, await readEponymeBody(event), user) : undefined
  if (!result) throw createError({ status: 404, message: t('server.collectionNotFound') })
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }
  setResponseStatus(event, 201)
  return result
})
