import { t } from '#eponyme/locale'
import { createError, defineEventHandler, getQuery, getRequestHeader, getRequestWebStream } from 'h3'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { useEponymeMediaSettings, useEponymeStorage } from '../../services/eponyme-storage'
import { assertEponymeMediaKey, assertEponymeUpload, eponymePublicUrl } from '../../utils/eponyme-media'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

/**
 * The upload path for a driver that cannot presign. The body is streamed straight to the
 * driver rather than buffered – a video would otherwise have to fit in memory first.
 */
export default defineEventHandler(async (event) => {
  const user = await requireEponymePermission(event, 'media.upload', { kind: 'system', name: 'media' })
  assertEponymeMutationOrigin(event)

  const settings = useEponymeMediaSettings()
  const key = assertEponymeMediaKey(getQuery(event).key, settings)
  const contentType = (getRequestHeader(event, 'content-type') ?? '').split(';')[0]!.trim()
  const size = Number(getRequestHeader(event, 'content-length'))
  assertEponymeUpload(contentType, size, settings)

  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ status: 400, message: t('server.mediaEmptyBody') })

  const driver = await useEponymeStorage()
  try {
    await driver.put(key, stream as ReadableStream<Uint8Array>, { contentType, size })
  }
  catch (error) {
    // A misconfigured deployment, not a bad request: worth a sentence the editor can repeat to
    // whoever deployed it, rather than the unhandled 500 an unrecognised throw becomes.
    if ((error as { code?: string })?.code === 'read_only') {
      throw createError({ status: 500, message: t('server.mediaReadOnly') })
    }
    throw error
  }

  // Read back rather than trusted: a stream that ended early would otherwise leave a truncated
  // object behind a URL the editor is about to save into an entry.
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

  return { key, url: await eponymePublicUrl(driver, key) }
})
