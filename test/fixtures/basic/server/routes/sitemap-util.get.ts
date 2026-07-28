// Exercises the auto-imported server utility exposed by the module, the path a
// host application would use to build its own sitemap without an HTTP round-trip.
export default defineEventHandler(async () => {
  return { entries: await getEponymeSitemapEntries() }
})
