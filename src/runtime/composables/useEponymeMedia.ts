import { t } from '#eponyme/locale'
import { useRuntimeConfig, useState } from '#app'
import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { EponymeMediaItem } from '../types/storage'
import { getEponymeErrorMessage } from '../utils/eponyme-error'

interface UploadTicket {
  mode: 'presign' | 'direct'
  key: string
  url: string
  headers: Record<string, string>
  publicUrl: string
  /** Present on a presigned ticket: the route through the application, if the provider is unreachable. */
  fallbackUrl?: string
}

export interface EponymeStorageSettings {
  /** Whether `eponyme.storage.ts` exists, which is what turns every upload path on. */
  enabled: boolean
  accept: string[]
  maxSize: number
}

export function useEponymeStorageSettings(): EponymeStorageSettings {
  const options = useRuntimeConfig().public.eponyme as {
    storage?: boolean
    storageAccept?: string[]
    storageMaxSize?: number
  } | undefined
  return {
    enabled: Boolean(options?.storage),
    accept: options?.storageAccept ?? [],
    maxSize: options?.storageMaxSize ?? 0,
  }
}

export function matchesEponymeAccept(accept: string[], contentType: string): boolean {
  if (!accept.length) return true
  return accept.some((pattern) => {
    if (pattern === '*' || pattern === '*/*') return true
    if (pattern.endsWith('/*')) return contentType.startsWith(pattern.slice(0, -1))
    return pattern === contentType
  })
}

export function formatEponymeBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${units[unit]}`
}

/**
 * Refused here as well as on the server, and for a different reason: the server has to refuse it,
 * this only spares the editor sending 200 MB before being told no.
 */
export function checkEponymeFile(
  file: File,
  limits: { accept?: string[], maxSize?: number },
): string {
  const settings = useEponymeStorageSettings()
  const accept = limits.accept?.length ? limits.accept : settings.accept
  const maxSize = Math.min(limits.maxSize || Number.POSITIVE_INFINITY, settings.maxSize || Number.POSITIVE_INFINITY)

  if (Number.isFinite(maxSize) && file.size > maxSize) {
    return t('file.tooLarge', { max: formatEponymeBytes(maxSize) })
  }
  if (!matchesEponymeAccept(accept, file.type || 'application/octet-stream')) {
    return t('file.rejectedType', { accept: accept.join(', ') })
  }
  return ''
}

/**
 * Sent with `XMLHttpRequest` rather than `fetch` for one reason: upload progress. `fetch` reports
 * nothing until the response arrives, and a video upload with no progress bar reads as a freeze.
 *
 * Credentials are deliberately left off: a presigned URL points at the provider, and a cookie has
 * no business travelling there. A same-origin direct upload still carries its cookie, which is
 * what the default does.
 */
/** The request never reached the other end: no answer, or a CORS preflight that refused it. */
class UploadUnreachable extends Error {}

function sendWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url, true)
    for (const [name, value] of Object.entries(headers)) {
      // The browser sets it from the body, and refuses to let a script do so.
      if (name.toLowerCase() === 'content-length') continue
      request.setRequestHeader(name, value)
    }
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(t('library.uploadFailed')))
    })
    // A refused preflight is indistinguishable from an unplugged cable here – the browser hides
    // the reason on purpose. Both mean the same thing to the caller: this route is not usable.
    request.addEventListener('error', () => reject(new UploadUnreachable(t('library.uploadFailed'))))
    request.addEventListener('abort', () => reject(new Error(t('library.uploadFailed'))))
    request.send(body)
  })
}

export interface UseEponymeMedia {
  items: Ref<EponymeMediaItem[]>
  pending: Ref<boolean>
  error: Ref<string>
  hasMore: ComputedRef<boolean>
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  upload: (file: File, onProgress?: (ratio: number) => void) => Promise<EponymeMediaItem>
  remove: (key: string) => Promise<void>
}

/** Coalesces concurrent reads of the same page, which is what several open pickers would ask for. */
let inFlight: Promise<void> | undefined

/**
 * The media library: what it holds, and the two things an editor does to it.
 *
 * The state is shared rather than per caller. A form can carry a dozen file fields, and each one
 * building its own copy would mean a dozen listings of the same bucket and an upload made in one
 * picker staying invisible in the next. There is only one library, so there is one list of it.
 */
export function useEponymeMedia(): UseEponymeMedia {
  const items = useState<EponymeMediaItem[]>('eponyme:media-items', () => [])
  const cursor = useState<string | null>('eponyme:media-cursor', () => null)
  const loaded = useState<boolean>('eponyme:media-loaded', () => false)
  const pending = useState<boolean>('eponyme:media-pending', () => false)
  const error = useState<string>('eponyme:media-error', () => '')

  function fetchPage(next: string | null): Promise<void> {
    // Two pickers opening at once must not both ask; the second joins the first.
    if (inFlight) return inFlight

    pending.value = true
    error.value = ''
    inFlight = (async () => {
      try {
        const response = await $fetch<{ items: EponymeMediaItem[], cursor: string | null }>('/api/eponyme-media', {
          query: next ? { cursor: next } : undefined,
        })
        items.value = next ? [...items.value, ...response.items] : response.items
        cursor.value = response.cursor
        loaded.value = true
      }
      catch (cause) {
        error.value = getEponymeErrorMessage(cause, t('library.uploadFailed'))
      }
      finally {
        pending.value = false
        inFlight = undefined
      }
    })()
    return inFlight
  }

  return {
    items,
    pending,
    error,
    hasMore: computed(() => cursor.value !== null),
    refresh: () => fetchPage(null),
    loadMore: () => (cursor.value ? fetchPage(cursor.value) : Promise.resolve()),

    async upload(file, onProgress) {
      const contentType = file.type || 'application/octet-stream'
      const ticket = await $fetch<UploadTicket>('/api/eponyme-media/upload', {
        method: 'POST',
        body: { name: file.name, contentType, size: file.size },
      })
      try {
        await sendWithProgress(ticket.url, ticket.headers, file, onProgress)
      }
      catch (cause) {
        // A bucket that does not allow this origin refuses the preflight, and the upload never
        // leaves the browser. Rather than make CORS a prerequisite for uploading at all, the
        // bytes go through the application instead – slower, but it always works. Configuring
        // CORS on the bucket is what turns the fast path back on.
        if (!(cause instanceof UploadUnreachable) || !ticket.fallbackUrl) throw cause
        await sendWithProgress(ticket.fallbackUrl, { 'content-type': contentType }, file, onProgress)
      }

      const item: EponymeMediaItem = {
        key: ticket.key,
        url: ticket.publicUrl,
        size: file.size,
        lastModified: new Date().toISOString(),
        contentType,
      }
      // Prepended rather than refetched: a listing is eventually consistent on most providers,
      // so asking again straight after an upload can answer without the object that was just
      // written – which reads as the upload having failed.
      if (loaded.value) items.value = [item, ...items.value]
      return item
    },

    async remove(key) {
      await $fetch('/api/eponyme-media/object', { method: 'DELETE', query: { key } })
      items.value = items.value.filter(item => item.key !== key)
    },
  }
}
