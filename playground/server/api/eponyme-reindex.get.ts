/**
 * Backfills the filterable index for every entry:
 *
 *     curl http://localhost:3000/api/eponyme-reindex
 *
 * Run it once after the `eponyme_entry_index` migration, and again whenever a field becomes
 * filterable that was not before – adding `field.tags()` to a collection leaves the entries
 * already stored unindexed until each is next saved. Ordinary writes maintain the index on
 * their own, so this is not needed when content changes.
 *
 * A Nitro task would be the natural home for maintenance that writes, but a module's server
 * auto-imports do not reach `server/tasks/`, so `reindexEponymeEntries` is undefined there.
 * Hence a route, closed outside dev rather than left reachable in production.
 */
export default defineEventHandler(async () => {
  if (!import.meta.dev) throw createError({ status: 404, message: 'Not found.' })
  return await reindexEponymeEntries()
})
