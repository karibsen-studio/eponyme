import { useEponymeService } from '../services/eponyme-service'

/**
 * Rebuilds the filterable index of every entry, unconditionally.
 *
 * Rarely needed: startup already rebuilds whatever a configuration change invalidated, so
 * adding a `field.tags()` to a collection that already holds entries is handled on its own.
 * This is the repair for what a fingerprint cannot see — editing a custom `validate` so that
 * it now rejects values already stored, or an index suspected of having drifted.
 *
 * Auto-imported, so a host can expose it on a route or call it from a script.
 */
export async function reindexEponymeEntries(): Promise<{ entries: number }> {
  return useEponymeService().reindexAll()
}
