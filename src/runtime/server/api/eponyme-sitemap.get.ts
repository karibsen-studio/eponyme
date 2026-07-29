import { defineEventHandler } from 'h3'
import { setEponymePublicCache } from '../utils/eponyme-cache'
import { getEponymeSitemapEntries } from '../utils/eponyme-sitemap'

export default defineEventHandler(async (event) => {
  // Published URLs only, identical for every caller: the same cache window as the content.
  setEponymePublicCache(event)
  return { entries: await getEponymeSitemapEntries() }
})
