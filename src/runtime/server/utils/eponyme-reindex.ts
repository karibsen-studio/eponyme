import { useEponymeService } from '../services/eponyme-service'

/** Rebuilds the filterable index of every entry, unconditionally. */
export async function reindexEponymeEntries(): Promise<{ entries: number }> {
  return useEponymeService().reindexAll()
}
