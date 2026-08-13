import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL, setResponseStatus } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { assertEponymeMutationOrigin, requireEponymeUser } from '../../utils/auth'
import { readEponymeBody } from '../../utils/body'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-collections\//, ''))
  const result = name ? await useEponymeService().createCollectionEntry(name, await readEponymeBody(event), user.id) : undefined
  if (!result) throw createError({ statusCode: 404, statusMessage: t('server.collectionNotFound') })
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }
  setResponseStatus(event, 201)
  return result
})
