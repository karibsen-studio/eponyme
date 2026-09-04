/** Dotted paths of every leaf that differs between two documents - `hero.title`, `items.0.title`. */
export function changedPaths(next: unknown, previous: unknown, prefix = ''): string[] {
  if (next === previous) return []

  // A container that appears or disappears is still walked down to its leaves, so the reported paths line
  // up with the error keys the validator produces.
  const nextRecord = isRecord(next) ? next : undefined
  const previousRecord = isRecord(previous) ? previous : undefined
  if ((nextRecord && (previousRecord || previous === undefined)) || (previousRecord && next === undefined)) {
    const left = nextRecord ?? {}
    const right = previousRecord ?? {}
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .flatMap(key => changedPaths(left[key], right[key], join(prefix, key)))
  }

  const nextArray = Array.isArray(next) ? next : undefined
  const previousArray = Array.isArray(previous) ? previous : undefined
  if ((nextArray && (previousArray || previous === undefined)) || (previousArray && next === undefined)) {
    const left = nextArray ?? []
    const right = previousArray ?? []
    const length = Math.max(left.length, right.length)
    return Array.from({ length }, (_, index) => index)
      .flatMap(index => changedPaths(left[index], right[index], join(prefix, String(index))))
  }

  return JSON.stringify(next) === JSON.stringify(previous) ? [] : [prefix]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function join(prefix: string, key: string) {
  return prefix ? `${prefix}.${key}` : key
}
