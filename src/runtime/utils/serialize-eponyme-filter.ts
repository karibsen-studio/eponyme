/**
 * The query and the cache key come from one sorted walk on purpose: a key that missed part of the filter
 * would let two listings share a cache entry, which reads as a filter that randomly stops working.
 */
export function serializeEponymeFilter(
  where: Record<string, unknown> | undefined,
): { query: Record<string, string | string[]>, key: string } {
  const query: Record<string, string | string[]> = {}
  // JSON rather than joined text: a tag containing the separator would otherwise write the same key as two
  // separate tags, and the two listings would share one cache entry.
  const parts: Array<[string, string[]]> = []
  const write = (name: string, values: string[]) => {
    if (!values.length) return
    query[name] = values
    parts.push([name, values])
  }
  // `String` rather than the raw value: a boolean field is filtered with `true`, and the index stores every
  // value as text.
  const list = (value: unknown) => (Array.isArray(value) ? value : [value]).map(String).filter(Boolean)

  for (const key of Object.keys(where ?? {}).sort()) {
    const condition = where![key]
    if (condition === undefined || condition === null) continue
    if (typeof condition !== 'object' || Array.isArray(condition)) {
      write(`where[${key}]`, list(condition))
      continue
    }
    // Sorted, so two filters that differ only in how they were written share a cache key.
    for (const operator of Object.keys(condition).sort()) {
      write(`where[${key}][${operator}]`, list((condition as Record<string, unknown>)[operator]))
    }
  }
  return { query, key: JSON.stringify(parts) }
}
