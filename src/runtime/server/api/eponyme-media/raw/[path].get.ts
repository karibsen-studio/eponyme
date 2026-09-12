import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL, setResponseHeader } from 'h3'
import { useEponymeMediaSettings, useEponymeStorage } from '../../../services/eponyme-storage'
import { requireEponymePermission } from '../../../utils/eponyme-permissions'
import { assertEponymeMediaKey, guessContentType, isEponymeActiveMedia } from '../../../utils/eponyme-media'
import { decodeEponymeRoutePath } from '../../../utils/route-path'

const PREFIX = '/api/eponyme-media/raw/'

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  return code === 'not_found' || code === 'ENOENT'
}

/**
 * Reads an object back through the application, which is what makes a driver with no public origin - the
 * local one above all - usable from a page.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith(PREFIX)) throw createError({ status: 404, message: t('server.notFound') })

  const settings = useEponymeMediaSettings()
  const key = assertEponymeMediaKey(decodeEponymeRoutePath(path.slice(PREFIX.length)), settings)
  // Private media are read by the dashboard and by whoever holds `media.read`, never by an address alone:
  // a random key is a name, not an access control.
  if (settings.private) await requireEponymePermission(event, 'media.read', { kind: 'system', name: 'media' })
  const driver = await useEponymeStorage()

  let body: ReadableStream<Uint8Array>
  try {
    body = await driver.get(key)
  }
  catch (error) {
    if (isMissing(error)) throw createError({ status: 404, message: t('server.notFound') })
    throw error
  }

  // An object stored before the upload rule, or written straight into the bucket, is served as a
  // download instead of a document the browser would run on the site's own origin.
  const contentType = guessContentType(key)
  const active = isEponymeActiveMedia(key, contentType)
  setResponseHeader(event, 'content-type', active ? 'application/octet-stream' : contentType)
  if (active) setResponseHeader(event, 'content-disposition', 'attachment')
  setResponseHeader(event, 'content-security-policy', 'default-src \'none\'; sandbox; frame-ancestors \'none\'')
  // The key carries a random suffix, so a given URL always names the same bytes: a browser that has it
  // never asks again, which is what keeps the grid from re-reading on every visit. A private object gets
  // no such copy, in a shared cache or in the browser.
  setResponseHeader(
    event,
    'cache-control',
    settings.private ? 'private, no-store' : 'public, max-age=31536000, immutable',
  )
  return body
})
