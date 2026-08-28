import { useAsyncData, useRequestFetch, useRoute } from '#app'
import { useEventListener } from '@vueuse/core'
import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type eponymeConfig from '#eponyme/config'
import type { EponymeCollectionDataByName, EponymeCollectionFilter, EponymeCollectionName } from '../types'
import type { EponymeCollectionEntry, EponymeSortDirection, EponymeStatus, EponymeVersionSelector } from '../server/services/eponyme-store'
import { readPreviewQuery, readPreviewVersion } from '../utils/preview'
import { cacheForPublicRead } from '../utils/hydration-cache'

type ConfigCollectionName = EponymeCollectionName<typeof eponymeConfig>

/** Sortable keys: the entry metadata plus every field of the collection. */
export type EponymeCollectionSortKey<Name extends ConfigCollectionName>
  = 'updatedAt' | 'publishedAt' | 'title' | 'slug'
    | (keyof EponymeCollectionDataByName<typeof eponymeConfig, Name> & string)

/**
 * The `where` a collection accepts: only the fields stored in a form the index can compare,
 * each with the values that field can actually hold. The server rejects anything else, so
 * the two agree rather than one silently widening the other.
 */
export type EponymeCollectionFilterInput<Name extends ConfigCollectionName>
  = EponymeCollectionFilter<typeof eponymeConfig, Name>

export interface UseEponymeCollectionOptions<Name extends ConfigCollectionName> {
  take?: number
  skip?: number
  orderBy?: EponymeCollectionSortKey<Name>
  order?: EponymeSortDirection
  /**
   * Keeps only the entries matching every key. A list of values matches any of them; `not`
   * excludes; `contains` matches a substring; and `gte`/`lte`/`gt`/`lt` compare as text,
   * which is exact for `field.date()`, pinned by validation to `YYYY-MM-DD`.
   */
  where?: EponymeCollectionFilterInput<Name>
}

export type UseEponymeCollectionReturn<Data extends Record<string, unknown>>
  = UseEponymeCollectionResult<Data> & Promise<UseEponymeCollectionResult<Data>>

export type UseEponymeCollectionEntryReturn<Data extends Record<string, unknown>>
  = UseEponymeCollectionEntryResult<Data> & Promise<UseEponymeCollectionEntryResult<Data>>

export interface UseEponymeCollectionResult<Data extends Record<string, unknown>> {
  entries: ComputedRef<EponymeCollectionEntry<Data>[]>
  /** Matching entries before `take` and `skip`, for building a pager. */
  total: ComputedRef<number>
  pending: Ref<boolean>
  error: Ref<Error | null | undefined>
  refresh: () => Promise<void>
}

export interface UseEponymeCollectionEntryOptions {
  version?: EponymeVersionSelector
}

export interface UseEponymeCollectionEntryResult<Data extends Record<string, unknown>> {
  data: Ref<{ data: Data } | undefined>
  status: ComputedRef<EponymeStatus>
  publishedAt: ComputedRef<string | null>
  pending: Ref<boolean>
  error: Ref<Error | null | undefined>
  refresh: () => Promise<void>
}

/**
 * The query and the cache key come from one sorted walk on purpose: a key that missed part of
 * the filter would let two listings share a cache entry, which reads as a filter that
 * randomly stops working.
 */
function serializeFilter(
  where: Record<string, unknown> | undefined,
): { query: Record<string, string | string[]>, key: string } {
  const query: Record<string, string | string[]> = {}
  const parts: string[] = []
  const write = (name: string, values: string[]) => {
    if (!values.length) return
    query[name] = values
    parts.push(`${name}=${values.join('|')}`)
  }
  // `String` rather than the raw value: a boolean field is filtered with `true`, and the
  // index stores every value as text.
  const list = (value: unknown) => (Array.isArray(value) ? value : [value]).map(String).filter(Boolean)

  for (const key of Object.keys(where ?? {}).sort()) {
    const condition = where![key]
    if (condition === undefined || condition === null) continue
    if (typeof condition !== 'object' || Array.isArray(condition)) {
      write(`where[${key}]`, list(condition))
      continue
    }
    // Sorted, so two filters that differ only in how they were written share a cache key.
    for (const operator of Object.keys(condition).sort()) {
      write(`where[${key}][${operator}]`, list((condition as Record<string, unknown>)[operator]))
    }
  }
  return { query, key: parts.join(',') }
}

export function useEponymeCollection<const Name extends ConfigCollectionName>(
  name: Name,
  options: UseEponymeCollectionOptions<Name> = {},
): UseEponymeCollectionReturn<EponymeCollectionDataByName<typeof eponymeConfig, Name>> {
  type Data = EponymeCollectionDataByName<typeof eponymeConfig, Name>
  const requestFetch = useRequestFetch()
  const filter = serializeFilter(options.where)
  const query = {
    take: options.take,
    skip: options.skip,
    orderBy: options.orderBy,
    order: options.order,
    ...filter.query,
  }
  const result = useAsyncData(
    // Every option belongs in the key, otherwise two differently sorted – or differently
    // filtered – calls to the same collection would share one cache entry and one would
    // silently answer with the other's results.
    `eponyme:collection:public:${name}:${options.take ?? ''}:${options.skip ?? ''}:${options.orderBy ?? ''}:${options.order ?? ''}:${filter.key}`,
    // Always the published listing, which is publicly cacheable: the browser cache may answer it.
    () => requestFetch<{ entries: EponymeCollectionEntry<Data>[], total: number }>(`/api/eponyme-collections/${name}`, { query }),
    { getCachedData: cacheForPublicRead(true) },
  )
  const entries = computed(() => result.data.value?.entries ?? [])
  if (import.meta.client) useEventListener(window, 'focus', () => void result.refresh())

  const api: UseEponymeCollectionResult<Data> = {
    entries,
    total: computed(() => result.data.value?.total ?? 0),
    pending: result.pending,
    error: result.error as Ref<Error | null | undefined>,
    refresh: async () => { await result.refresh() },
  }
  return Object.assign(result.then(() => api), api)
}

export function useEponymeCollectionEntry<const Name extends ConfigCollectionName>(
  name: Name,
  slug: string,
  options: UseEponymeCollectionEntryOptions = {},
): UseEponymeCollectionEntryReturn<EponymeCollectionDataByName<typeof eponymeConfig, Name>> {
  type Data = EponymeCollectionDataByName<typeof eponymeConfig, Name>
  type Response = { data: Data, status: EponymeStatus, publishedAt: string | null }
  const route = useRoute()
  // The preview panel puts the full entry name (`<collection>/<slug>`) in the query.
  const preview = readPreviewQuery(route.query)
  const version = options.version ?? (preview.entry === `${name}/${slug}` ? readPreviewVersion(preview.version) : 'published')
  const requestFetch = useRequestFetch()
  const isPublicContent = version === 'published'
  // See `useEponyme`: a version taken from the preview query is fetched from the browser
  // only, so a cached page route can never hold unreleased content.
  const isPreviewRead = options.version === undefined && !isPublicContent
  const result = useAsyncData(
    `eponyme:collection-entry:${name}:${slug}:${version}`,
    () => requestFetch<Response>(`/api/eponyme/${name}/${encodeURIComponent(slug)}`, {
      query: { version },
      // A draft or a historical version must never be stored, whatever the server says.
      cache: isPublicContent ? undefined : 'no-store',
    }),
    { server: !isPreviewRead, getCachedData: cacheForPublicRead(isPublicContent) },
  )
  if (import.meta.client) useEventListener(window, 'focus', () => void result.refresh())

  const api: UseEponymeCollectionEntryResult<Data> = {
    data: result.data as Ref<{ data: Data } | undefined>,
    status: computed(() => result.data.value?.status ?? 'published'),
    publishedAt: computed(() => result.data.value?.publishedAt ?? null),
    pending: result.pending,
    error: result.error as Ref<Error | null | undefined>,
    refresh: async () => { await result.refresh() },
  }
  return Object.assign(result.then(() => api), api)
}
