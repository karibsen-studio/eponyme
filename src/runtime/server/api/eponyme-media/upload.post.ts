import { t } from '#eponyme/locale'
import { createError, defineEventHandler } from 'h3'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { readEponymeBody } from '../../utils/body'
import { useEponymeMediaSettings, useEponymeStorage } from '../../services/eponyme-storage'
import { assertEponymeUpload, buildEponymeMediaKey, eponymePublicUrl } from '../../utils/eponyme-media'

interface UploadRequest {
  name?: string
  contentType?: string
  size?: number
}

/**
 * Reserves a key and says how to send the bytes.
 *
 * `presign` hands the browser a URL onto the provider, so the file never travels through the
 * application. A driver without `presignPut` – the local one, and any other with no third party
 * to sign for – gets `direct` instead, and the bytes go through Eponyme's own route.
 */
export default defineEventHandler(async (event) => {
  await requireEponymePermission(event, 'media.upload', { kind: 'system', name: 'media' })
  assertEponymeMutationOrigin(event)

  const body = await readEponymeBody<UploadRequest>(event, 4 * 1024)
  if (!body) throw createError({ status: 400, message: t('server.invalidJson') })

  const settings = useEponymeMediaSettings()
  const contentType = String(body.contentType ?? '')
  const size = Number(body.size)
  assertEponymeUpload(contentType, size, settings)

  const driver = await useEponymeStorage()
  const key = buildEponymeMediaKey(String(body.name ?? ''), settings)
  const meta = { contentType, size }
  const throughApplication = `/api/eponyme-media/object?key=${encodeURIComponent(key)}`

  if (driver.presignPut) {
    const presigned = await driver.presignPut(key, meta)
    return {
      mode: 'presign' as const,
      key,
      url: presigned.url,
      headers: presigned.headers,
      // Whether the browser is allowed to reach the bucket is a CORS rule only the browser can
      // discover, so the answer carries both routes and the client falls back on its own.
      fallbackUrl: throughApplication,
      publicUrl: await eponymePublicUrl(driver, key),
    }
  }

  return {
    mode: 'direct' as const,
    key,
    url: throughApplication,
    headers: { 'content-type': contentType },
    publicUrl: await eponymePublicUrl(driver, key),
  }
})
