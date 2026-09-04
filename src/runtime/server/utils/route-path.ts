import { t } from '#eponyme/locale'
import { createError, getRequestURL } from 'h3'
import type { H3Event } from 'h3'

/**
 * A content name is a collection path plus a slug, never a filesystem path: well beyond anything the
 * dashboard writes, and short enough that a crafted URL cannot become work for the router.
 */
const MAX_PATH_LENGTH = 512

/**
 * Reads the wildcard part of an Eponyme route. `decodeURIComponent()` throws on a lone `%`, which without
 * this would leave the handler and surface as a 500 for what is a malformed request.
 */
export function readEponymeRoutePath(event: H3Event, prefix: RegExp): string {
  const pathname = getRequestURL(event).pathname
  if (pathname.length > MAX_PATH_LENGTH) throw invalidPath()
  return decodeEponymeRoutePath(pathname.replace(prefix, ''))
}

export function decodeEponymeRoutePath(value: string): string {
  if (value.length > MAX_PATH_LENGTH) throw invalidPath()
  try {
    return decodeURIComponent(value)
  }
  catch {
    throw invalidPath()
  }
}

function invalidPath() {
  return createError({ status: 400, message: t('server.invalidPath') })
}
