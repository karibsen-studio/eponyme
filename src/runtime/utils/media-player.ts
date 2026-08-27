import type { MediaPlayerFieldOptions, MediaPlayerProvider, MediaPlayerValue } from '../types/field'

export const MEDIA_PLAYER_PROVIDERS: readonly MediaPlayerProvider[] = ['youtube', 'vimeo', 'url']

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']
const YOUTUBE_SHORT_HOSTS = ['youtu.be', 'www.youtu.be']
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']

const YOUTUBE_ID = /^[\w-]{6,20}$/
const VIMEO_ID = /^\d+$/

export const EMPTY_MEDIA_PLAYER_VALUE: MediaPlayerValue = { provider: '', url: '', id: '' }

/** Providers a field accepts, in detection order, with the default applied. */
export function mediaPlayerProviders(options: Pick<MediaPlayerFieldOptions, 'providers'> = {}): MediaPlayerProvider[] {
  const providers = options.providers?.filter(provider => MEDIA_PLAYER_PROVIDERS.includes(provider))
  return providers?.length ? [...new Set(providers)] : [...MEDIA_PLAYER_PROVIDERS]
}

/**
 * Reads a pasted address into the value the field stores.
 *
 * The provider is detected rather than picked in the interface: an editor pastes the address
 * they have, and a provider chosen by hand is one more thing that can contradict the URL.
 * `url` is the fallback for a file served directly – anything the browser can play in a
 * `<video>` – so it only answers once the hosted providers have declined.
 *
 * `provider` is empty when nothing recognised it, which is what validation reports. The parse
 * never throws, so an address still being typed simply reads as unrecognised.
 */
export function parseEponymeMediaUrl(url: unknown, options: Pick<MediaPlayerFieldOptions, 'providers'> = {}): MediaPlayerValue {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) return { ...EMPTY_MEDIA_PLAYER_VALUE }

  const allowed = mediaPlayerProviders(options)
  const parsed = parseUrl(raw)
  if (!parsed) return { provider: '', url: raw, id: '' }

  const host = parsed.hostname.toLowerCase()

  if (allowed.includes('youtube')) {
    const id = youtubeId(parsed, host)
    if (id) return { provider: 'youtube', url: raw, id }
  }

  if (allowed.includes('vimeo')) {
    const id = vimeoId(parsed, host)
    if (id) return { provider: 'vimeo', url: raw, id }
  }

  // A hosted address that its provider is not allowed to serve must not fall through to
  // `url`: a YouTube watch page in a `<video>` element plays nothing.
  if (isHostedHost(host)) return { provider: '', url: raw, id: '' }

  if (allowed.includes('url') && (parsed.protocol === 'http:' || parsed.protocol === 'https:'))
    return { provider: 'url', url: raw, id: '' }

  return { provider: '', url: raw, id: '' }
}

/**
 * Rereads a stored value, so `provider` and `id` always describe the URL they sit next to.
 * The API accepts any JSON, so a client is never what decides which provider a value claims.
 */
export function normalizeEponymeMediaPlayer(value: unknown, options: Pick<MediaPlayerFieldOptions, 'providers'> = {}): unknown {
  if (typeof value === 'string') return parseEponymeMediaUrl(value, options)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const url = (value as Partial<MediaPlayerValue>).url
  if (typeof url !== 'string') return value
  return parseEponymeMediaUrl(url, options)
}

/**
 * Address to put in an `iframe` for a hosted provider, or the file itself for `url` – which
 * belongs in a `<video>` instead. Empty when the value carries nothing playable.
 *
 * Derived on read rather than stored: an embed address is the provider's contract, not the
 * editor's input, and a stored copy would keep serving yesterday's parameters.
 */
export function eponymeMediaEmbedUrl(value: unknown): string {
  const media = toMediaPlayerValue(value)
  if (!media.url) return ''

  if (media.provider === 'url') return media.url
  if (!media.id) return ''

  if (media.provider === 'youtube')
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(media.id)}`

  if (media.provider === 'vimeo') {
    // An unlisted video only plays with the hash it was shared with, which lives in the URL.
    const hash = vimeoPrivacyHash(media.url)
    return `https://player.vimeo.com/video/${encodeURIComponent(media.id)}${hash ? `?h=${encodeURIComponent(hash)}` : ''}`
  }

  return ''
}

/** Poster image for a hosted provider. Vimeo has no address-only thumbnail, so it has none. */
export function eponymeMediaThumbnailUrl(value: unknown): string {
  const media = toMediaPlayerValue(value)
  if (media.provider === 'youtube' && media.id) return `https://i.ytimg.com/vi/${encodeURIComponent(media.id)}/hqdefault.jpg`
  return ''
}

/** Reads unknown input into the value shape, so a partial or absent value still renders. */
export function toMediaPlayerValue(value: unknown): MediaPlayerValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_MEDIA_PLAYER_VALUE }
  const media = value as Partial<MediaPlayerValue>
  const provider = typeof media.provider === 'string' && (MEDIA_PLAYER_PROVIDERS as readonly string[]).includes(media.provider)
    ? media.provider as MediaPlayerProvider
    : ''
  return {
    provider,
    url: typeof media.url === 'string' ? media.url : '',
    id: typeof media.id === 'string' ? media.id : '',
  }
}

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw)
  }
  catch {
    return undefined
  }
}

function isHostedHost(host: string) {
  return YOUTUBE_HOSTS.includes(host) || YOUTUBE_SHORT_HOSTS.includes(host) || VIMEO_HOSTS.includes(host)
}

function youtubeId(url: URL, host: string): string {
  if (YOUTUBE_SHORT_HOSTS.includes(host)) return validId(segments(url)[0], YOUTUBE_ID)
  if (!YOUTUBE_HOSTS.includes(host)) return ''

  const parts = segments(url)
  if (parts[0] === 'watch') return validId(url.searchParams.get('v'), YOUTUBE_ID)
  // `embed`, `shorts`, `live` and `v` all carry the id in the following segment.
  if (parts[0] && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) return validId(parts[1], YOUTUBE_ID)
  return ''
}

function vimeoId(url: URL, host: string): string {
  if (!VIMEO_HOSTS.includes(host)) return ''
  const parts = segments(url)
  if (host === 'player.vimeo.com') return parts[0] === 'video' ? validId(parts[1], VIMEO_ID) : ''
  // `vimeo.com/123`, and the id is also the last numeric segment of `channels/x/123`.
  const numeric = [...parts].reverse().find(part => VIMEO_ID.test(part))
  return validId(numeric, VIMEO_ID)
}

function vimeoPrivacyHash(raw: string): string {
  const url = parseUrl(raw)
  if (!url) return ''
  const query = url.searchParams.get('h')
  if (query) return query
  const parts = segments(url)
  const index = parts.findIndex(part => VIMEO_ID.test(part))
  const hash = index >= 0 ? parts[index + 1] : undefined
  return hash && /^[\da-z]+$/i.test(hash) ? hash : ''
}

function segments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean)
}

function validId(candidate: string | null | undefined, pattern: RegExp): string {
  return candidate && pattern.test(candidate) ? candidate : ''
}
