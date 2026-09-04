import type { H3Event } from 'h3'
import { readEponymeRoutePath } from './route-path'

/**
 * Form names may contain slashes (a form nested in a folder), so the route is a wildcard and the path is
 * re-parsed here.
 */
export interface EponymeFormRoute {
  name: string
  /** True when the path carried the `/submissions` suffix. */
  submissions: boolean
  submissionId?: string
}

export function readEponymeFormRoute(event: H3Event): EponymeFormRoute | undefined {
  const path = readEponymeRoutePath(event, /^\/api\/eponyme-forms\/?/)
  if (!path) return undefined

  const segments = path.split('/').filter(Boolean)
  const suffix = segments.lastIndexOf('submissions')
  if (suffix === -1) return { name: segments.join('/'), submissions: false }
  // Only `<name>/submissions` and `<name>/submissions/<id>` are valid shapes.
  if (suffix === 0 || segments.length > suffix + 2) return undefined

  return {
    name: segments.slice(0, suffix).join('/'),
    submissions: true,
    submissionId: segments[suffix + 1],
  }
}
