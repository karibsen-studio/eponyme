import { createError, getRequestHeader, getRequestWebStream } from 'h3'
import type { H3Event } from 'h3'

export const EPONYME_LOGIN_BODY_BYTES = 4 * 1024
export const EPONYME_MUTATION_BODY_BYTES = 1024 * 1024

export async function readEponymeBody<T>(
  event: H3Event,
  limit = EPONYME_MUTATION_BODY_BYTES,
  statusMessage?: string,
): Promise<T | undefined> {
  const raw = await readEponymeRawBody(event, limit, statusMessage)
  if (!raw) return undefined

  try {
    return JSON.parse(raw) as T
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be valid JSON.' })
  }
}

export async function readEponymeRawBody(
  event: H3Event,
  limit: number,
  statusMessage?: string,
): Promise<string | undefined> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('Request body limit must be a positive safe integer.')

  const contentLength = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(contentLength) && contentLength > limit)
    throw bodyTooLarge(statusMessage)

  const stream = getRequestWebStream(event)
  if (!stream) return undefined

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
      size += chunk.byteLength
      if (size > limit) {
        await reader.cancel('Request body is too large.')
        throw bodyTooLarge(statusMessage)
      }
      chunks.push(chunk)
    }
  }
  finally {
    reader.releaseLock()
  }

  if (size === 0) return undefined
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function bodyTooLarge(statusMessage = 'Request body is too large.') {
  return createError({ statusCode: 413, statusMessage })
}
