import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, getRequestHeader, getRequestWebStream } from 'h3'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { useEponymeMediaSettings, useEponymeStorage } from '../../services/eponyme-storage'
import {
  assertEponymeMediaKey,
  assertEponymeReservedKey,
  assertEponymeUpload,
  eponymePublicUrl,
  formatBytes,
  limitEponymeStream,
} from '../../utils/eponyme-media'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

/** The upload path for a driver that cannot presign. */
export default defineEventHandler(async (event) => {
  const user = await requireEponymePermission(event, 'media.upload', { kind: 'system', name: 'media' })
  assertEponymeMutationOrigin(event)

  const settings = useEponymeMediaSettings()
  const key = assertEponymeMediaKey(getQuery(event).key, settings)
  const contentType = (getRequestHeader(event, 'content-type') ?? '').split(';')[0]!.trim()
  const size = Number(getRequestHeader(event, 'content-length'))
  assertEponymeUpload(contentType, size, settings, key)
  // The client names the key, so it may only name one this module would have generated - never
  // `uploads/logo.png`, which is somebody else's published object.
  assertEponymeReservedKey(key, settings)

  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ status: 400, message: t('server.mediaEmptyBody') })

  const driver = await useEponymeStorage()
  // An upload writes a new object; replacing the bytes behind an address already published is not
  // something `media.upload` alone may do. A new upload gets a new key, and so a new address.
  if (await driver.stat(key)) throw createError({ status: 409, message: t('server.mediaKeyTaken') })

  try {
    // Counted here rather than trusted to the header: the driver reads until the stream ends, and a client
    // that announced a small file can keep sending. The stream is cut at the limit instead.
    await driver.put(key, limitEponymeStream(stream, settings.maxSize), { contentType, size })
  }
  catch (error) {
    const code = (error as { code?: string })?.code
    // A misconfigured deployment, not a bad request: worth a sentence the editor can repeat to whoever
    // deployed it, rather than the unhandled 500 an unrecognised throw becomes.
    if (code === 'read_only') throw createError({ status: 500, message: t('server.mediaReadOnly') })
    // Whatever the driver managed to write before the stream was cut is not an object anyone should reach.
    await driver.delete(key).catch(() => {})
    if (code === 'too_large') {
      throw createError({ status: 413, message: t('server.mediaTooLarge', { max: formatBytes(settings.maxSize) }) })
    }
    throw error
  }

  // Read back rather than trusted: a stream that ended early - or was cut for going past the limit - would
  // otherwise leave a truncated or oversized object behind a URL the editor is about to save into an entry.
  const stored = await driver.stat(key)
  if (!stored || stored.size !== size) {
    await driver.delete(key).catch(() => {})
    throw createError({ status: 400, message: t('server.mediaIncompleteUpload') })
  }

  await recordEponymeAudit(event, {
    actor: user,
    action: 'media.uploaded',
    resourceType: 'system',
    resourceName: key,
    metadata: { contentType, size },
  })

  return { key, url: await eponymePublicUrl(driver, key, settings) }
})
