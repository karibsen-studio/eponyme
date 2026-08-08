import { describe, expect, it } from 'vitest'
import { H3Event } from 'h3'
import { readEponymeBody, readEponymeRawBody } from '../src/runtime/server/utils/body'

function bodyEvent(body: string): H3Event {
  const event = new H3Event(
    { method: 'POST', headers: { 'content-type': 'application/json' } } as never,
    {} as never,
  )
  event._requestBody = new Blob([body]).stream() as BodyInit
  return event
}

describe('bounded Eponyme request bodies', () => {
  it('reads JSON only while it remains within the byte limit', async () => {
    const event = bodyEvent(JSON.stringify({ ok: true }))

    await expect(readEponymeBody<{ ok: boolean }>(event, 64)).resolves.toEqual({ ok: true })
  })

  it('rejects an oversized body before returning its buffered value', async () => {
    const event = bodyEvent('x'.repeat(65))

    await expect(readEponymeRawBody(event, 64, 'Too large.')).rejects.toMatchObject({
      statusCode: 413,
      statusMessage: 'Too large.',
    })
  })
})
