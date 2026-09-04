import type { EponymeService } from '../services/eponyme-store'

/**
 * Splits `<collection>/<slug>` when the name belongs to a configured collection, so hook listeners can
 * branch on the collection without re-parsing the name themselves.
 */
export function splitEponymeCollectionEntry(
  service: EponymeService,
  name: string,
): { name: string, slug: string } | undefined {
  const separator = name.lastIndexOf('/')
  if (separator <= 0) return undefined
  const collection = name.slice(0, separator)
  const slug = name.slice(separator + 1)
  return slug && service.getCollection(collection) ? { name: collection, slug } : undefined
}
