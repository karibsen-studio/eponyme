import { defineEventHandler } from 'h3'
import { getEponymeSitemapEntries } from '../utils/eponyme-sitemap'

export default defineEventHandler(async () => {
  return { entries: await getEponymeSitemapEntries() }
})
