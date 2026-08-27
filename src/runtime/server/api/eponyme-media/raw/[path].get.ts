import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getRequestURL, setResponseHeader } from 'h3'
import { useEponymeMediaSettings, useEponymeStorage } from '../../../services/eponyme-storage'
import { assertEponymeMediaKey, guessContentType } from '../../../utils/eponyme-media'

const PREFIX = '/api/eponyme-media/raw/'

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  return code === 'not_found' || code === 'ENOENT'
}

/**
 * Reads an object back through the application, which is what makes a driver with no public
 * origin – the local one above all – usable from a page.
 *
 * Deliberately unauthenticated: this is the URL saved into an entry and rendered by the public
 * site, so requiring a session would only mean no visitor could ever load it. Only the
 * configured upload prefix is reachable, so it exposes what the dashboard already publishes and
 * nothing else in the bucket.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith(PREFIX)) throw createError({ status: 404, message: t('server.notFound') })

  const key = assertEponymeMediaKey(decodeURIComponent(path.slice(PREFIX.length)), useEponymeMediaSettings())
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
  // The key carries a random suffix, so a given URL always names the same bytes: a browser that
  // has it never asks again, which is what keeps the grid from re-reading on every visit.
  setResponseHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  return body
})
