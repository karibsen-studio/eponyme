import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL, setResponseHeader } from 'h3'
import { useEponymeMediaSettings, useEponymeStorage } from '../../../services/eponyme-storage'
import { assertEponymeMediaKey, guessContentType } from '../../../utils/eponyme-media'
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

  const key = assertEponymeMediaKey(decodeEponymeRoutePath(path.slice(PREFIX.length)), useEponymeMediaSettings())
  const driver = await useEponymeStorage()

  let body: ReadableStream<Uint8Array>
  try {
    body = await driver.get(key)
  }
  catch (error) {
    if (isMissing(error)) throw createError({ status: 404, message: t('server.notFound') })
    throw error
  }

  setResponseHeader(event, 'content-type', guessContentType(key))
  // The key carries a random suffix, so a given URL always names the same bytes: a browser that has it
  // never asks again, which is what keeps the grid from re-reading on every visit.
  setResponseHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  return body
})
