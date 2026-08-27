import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymePermission } from '../../utils/eponyme-permissions'

export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRequestURL(event).pathname.replace(/^\/api\/eponyme-trash\//, ''))
  if (!name) throw createError({ status: 404, message: t('server.collectionNotFound') })
  await requireEponymePermission(event, 'content.restore', { kind: 'collection', name })

  const page = await useEponymeService().listCollectionTrash(name)
  if (!page) throw createError({ status: 404, message: t('server.collectionNotFound') })
  // Trashed content is never public, so it is returned raw, without variable interpolation.
  return page
})
