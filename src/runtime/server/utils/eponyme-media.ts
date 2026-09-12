import { t } from '#eponyme/locale'
import { createError } from 'h3'
import type { EponymeMediaItem, EponymeStorageDriver, EponymeStorageObject } from '../../types/storage'

export interface EponymeMediaSettings {
  prefix: string
  maxSize: number
  accept: string[]
  /** Reads go through the application and ask for `media.read`, instead of being public and cacheable. */
  private?: boolean
}

/**
 * Keys are validated here as well as in the driver: a key arrives from the browser on every media route,
 * and a route that hands an unchecked one to a driver is trusting the client to stay inside the prefix.
 */
export function assertEponymeMediaKey(key: unknown, settings: EponymeMediaSettings): string {
  const invalid = typeof key !== 'string'
    || key === ''
    || key.startsWith('/')
    || key.includes('\0')
    || key.includes('\\')
    || key.split('/').some(segment => segment === '.' || segment === '..')
  if (invalid) throw createError({ status: 400, message: t('server.mediaInvalidKey') })
  // Confining every route to the configured prefix is what keeps them from reaching the rest of a bucket
  // the application may well be sharing with something else.
  if (settings.prefix && !(key as string).startsWith(`${settings.prefix}/`)) {
    throw createError({ status: 400, message: t('server.mediaInvalidKey') })
  }
  return key as string
}

function matchesContentType(pattern: string, contentType: string): boolean {
  if (pattern === '*/*' || pattern === '*') return true
  if (pattern.endsWith('/*')) return contentType.startsWith(pattern.slice(0, -1))
  return pattern === contentType
}

/** Formats a browser runs when the document is opened directly, whatever the `img` tag around them does. */
const ACTIVE_EXTENSIONS = new Set([
  'svg', 'svgz', 'html', 'htm', 'xhtml', 'xht', 'shtml', 'mhtml', 'mht', 'xml', 'js', 'mjs',
])

const ACTIVE_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'multipart/related',
])

export function isEponymeActiveMedia(key: string, contentType?: string): boolean {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return ACTIVE_EXTENSIONS.has(extension) || ACTIVE_TYPES.has((contentType ?? '').toLowerCase())
}

export function assertEponymeUpload(
  contentType: string,
  size: number,
  settings: EponymeMediaSettings,
  fileName = '',
): void {
  // A strict media type, not a permissive one: the value is signed into an upload URL and sent back as a
  // response header, so anything unusual in it would travel a long way.
  if (!contentType || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) {
    throw createError({ status: 400, message: t('server.mediaInvalidType') })
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw createError({ status: 400, message: t('server.mediaInvalidSize') })
  }
  if (size > settings.maxSize) {
    throw createError({ status: 413, message: t('server.mediaTooLarge', { max: formatBytes(settings.maxSize) }) })
  }
  if (settings.accept.length && !settings.accept.some(pattern => matchesContentType(pattern, contentType))) {
    throw createError({ status: 415, message: t('server.mediaRejectedType', { accept: settings.accept.join(', ') }) })
  }
  // A script inside an SVG runs with the site's own origin once the document is opened, so the format is
  // refused rather than stored, whichever type the client declared for it.
  if (isEponymeActiveMedia(fileName, contentType)) {
    throw createError({ status: 415, message: t('server.mediaActiveType') })
  }
  // The read route names the type from the extension: a name disagreeing with the declared type would
  // be served as something else than what was checked here.
  const named = fileName.includes('.') ? EXTENSION_TYPES[fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()] : undefined
  if (named && named !== contentType) {
    throw createError({ status: 400, message: t('server.mediaTypeMismatch') })
  }
}

/**
 * Stops a body at `limit` bytes, whatever `Content-Length` announced. The driver reads a stream until it
 * ends and counts nothing itself, so this is the only place the transfer is actually bounded.
 */
export function limitEponymeStream(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let written = 0
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength
      if (written > limit) {
        controller.error(Object.assign(new Error('upload exceeded the configured size limit'), { code: 'too_large' as const }))
        return
      }
      controller.enqueue(chunk)
    },
  }))
}

export function formatBytes(bytes: number): string {
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
 * A stored key derived from the uploaded name: dated folders so a bucket stays browsable, a slug so it
 * stays readable, and a random suffix so two uploads of `photo.jpg` never collide - an overwrite would
 * silently change an image already published somewhere else.
 */
export function buildEponymeMediaKey(fileName: string, settings: EponymeMediaSettings): string {
  const cleaned = String(fileName ?? '').split(/[/\\]/).pop() ?? ''
  const dot = cleaned.lastIndexOf('.')
  const extension = dot > 0 ? cleaned.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : ''
  const base = (dot > 0 ? cleaned.slice(0, dot) : cleaned)
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file'
  const now = new Date()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const suffix = Math.random().toString(36).slice(2, 8)
  const name = extension ? `${base}-${suffix}.${extension}` : `${base}-${suffix}`
  return [settings.prefix, now.getUTCFullYear(), month, name].filter(Boolean).join('/')
}

/**
 * The shape `buildEponymeMediaKey()` writes: dated folders, a slug, a random suffix. The upload route
 * accepts a key from the client, so it accepts only one it could have generated - a chosen key such as
 * `uploads/logo.png` would name an object someone else already published.
 */
export function assertEponymeReservedKey(key: string, settings: EponymeMediaSettings): void {
  const prefix = settings.prefix ? `${settings.prefix}/` : ''
  const pattern = new RegExp(`^${escapeRegExp(prefix)}\\d{4}/\\d{2}/[a-z0-9-]+(?:\\.[a-z0-9]+)?$`)
  if (!pattern.test(key)) throw createError({ status: 400, message: t('server.mediaUnreservedKey') })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Where Eponyme reads an object back when the driver has no address that lasts. */
export function eponymeRawUrl(key: string): string {
  return `/api/eponyme-media/raw/${key.split('/').map(encodeURIComponent).join('/')}`
}

/** An address that will still resolve in a year, which is the only kind worth saving into an entry. */
export async function eponymePublicUrl(
  driver: EponymeStorageDriver,
  key: string,
  settings: EponymeMediaSettings,
): Promise<string> {
  // Private media are only ever addressed through the route that checks the session; an address the
  // driver hands out would answer without one.
  if (settings.private) return eponymeRawUrl(key)
  const address = await driver.url(key)
  return isPresigned(address) ? eponymeRawUrl(key) : address
}

function isPresigned(address: string): boolean {
  return /[?&](?:X-Amz-Signature|X-Goog-Signature)=/i.test(address)
}

/** The same decision for a whole page of a listing, taken once. */
export async function toEponymeMediaItems(
  driver: EponymeStorageDriver,
  objects: EponymeStorageObject[],
  settings: EponymeMediaSettings,
): Promise<EponymeMediaItem[]> {
  if (!objects.length) return []
  const expiring = settings.private || isPresigned(await driver.url(objects[0]!.key))

  return Promise.all(objects.map(async object => ({
    key: object.key,
    url: expiring ? eponymeRawUrl(object.key) : await driver.url(object.key),
    size: object.size,
    lastModified: object.lastModified.toISOString(),
    contentType: guessContentType(object.key),
  })))
}

const EXTENSION_TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  zip: 'application/zip',
  csv: 'text/csv',
  txt: 'text/plain',
}

/**
 * Read from the key rather than asked of the provider: a listing returns hundreds of objects, and a `stat`
 * each would be hundreds of round trips for a label.
 */
export function guessContentType(key: string): string {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return EXTENSION_TYPES[extension] ?? 'application/octet-stream'
}
