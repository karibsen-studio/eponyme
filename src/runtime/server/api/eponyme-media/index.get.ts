import { defineEventHandler, getQuery } from 'h3'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { useEponymeMediaSettings, useEponymeStorage } from '../../services/eponyme-storage'
import { toEponymeMediaItems } from '../../utils/eponyme-media'

const PAGE_SIZE = 60

export default defineEventHandler(async (event) => {
  await requireEponymePermission(event, 'media.read', { kind: 'system', name: 'media' })
  const settings = useEponymeMediaSettings()
  const driver = await useEponymeStorage()
  const query = getQuery(event)
  const cursor = typeof query.cursor === 'string' && query.cursor ? query.cursor : undefined

  const page = await driver.list(settings.prefix ? `${settings.prefix}/` : '', {
    limit: PAGE_SIZE,
    cursor,
  })
  const items = await toEponymeMediaItems(driver, page.objects)

  items.sort((a, b) => b.lastModified.localeCompare(a.lastModified))
  return { items, cursor: page.cursor ?? null }
})
