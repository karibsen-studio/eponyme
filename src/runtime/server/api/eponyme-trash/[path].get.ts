import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-trash\//, ''))
  if (!name) throw createError({ statusCode: 404, statusMessage: t('server.collectionNotFound') })

  const page = await useEponymeService().listCollectionTrash(name)
  if (!page) throw createError({ statusCode: 404, statusMessage: t('server.collectionNotFound') })
  // Trashed content is never public, so it is returned raw, without variable interpolation.
  return page
})
