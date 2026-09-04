import { t } from '#eponyme/locale'
import { createError, defineEventHandler } from 'h3'
import { useEponymeService } from '../../services/eponyme-service'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { readEponymeRoutePath } from '../../utils/route-path'

export default defineEventHandler(async (event) => {
  const name = readEponymeRoutePath(event, /^\/api\/eponyme-trash\//)
  if (!name) throw createError({ status: 404, message: t('server.collectionNotFound') })
  await requireEponymePermission(event, 'content.restore', { kind: 'collection', name })

  const page = await useEponymeService().listCollectionTrash(name)
  if (!page) throw createError({ status: 404, message: t('server.collectionNotFound') })
  // Trashed content is never public, so it is returned raw, without variable interpolation.
  return page
})
