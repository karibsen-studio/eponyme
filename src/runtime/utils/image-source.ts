import type { ImageSource } from '../types/field'
import type { EponymeMessageKey } from '../locales'

const sourceLabels = {
  absolute: 'field.imageSourceAbsolute',
  relative: 'field.imageSourceRelative',
  upload: 'field.imageSourceUpload',
} as const satisfies Record<ImageSource, EponymeMessageKey>

export function eponymeImageSourceLabel(source: ImageSource): EponymeMessageKey {
  return sourceLabels[source]
}

export const EPONYME_IMAGE_SOURCES = ['absolute', 'relative', 'upload'] as const satisfies readonly ImageSource[]
export const EPONYME_UPLOADED_IMAGE_PREFIX = '/api/eponyme-media/raw/'

const imageSources = new Set<string>(EPONYME_IMAGE_SOURCES)

export function normalizeEponymeImageSources(sources?: readonly ImageSource[]): ImageSource[] {
  const configured = sources ?? EPONYME_IMAGE_SOURCES
  if (!Array.isArray(configured) || configured.length === 0) {
    throw new TypeError('[Eponyme] field.image() needs at least one source.')
  }

  const normalized: ImageSource[] = []
  for (const source of configured) {
    if (!imageSources.has(source)) {
      throw new TypeError(`[Eponyme] Unknown field.image() source "${String(source)}".`)
    }
    if (!normalized.includes(source)) normalized.push(source)
  }
  return normalized
}

export function classifyEponymeImageSource(value: string): ImageSource | undefined {
  const address = value.trim()
  if (address.startsWith(EPONYME_UPLOADED_IMAGE_PREFIX)) return 'upload'

  if (/^https?:\/\//i.test(address)) {
    try {
      const parsed = new URL(address)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? 'absolute' : undefined
    }
    catch {
      return undefined
    }
  }

  return address.startsWith('/') && !address.startsWith('//') ? 'relative' : undefined
}

export function eponymeUploadedImageUrl(key: string): string {
  return `${EPONYME_UPLOADED_IMAGE_PREFIX}${key.split('/').map(encodeURIComponent).join('/')}`
}
