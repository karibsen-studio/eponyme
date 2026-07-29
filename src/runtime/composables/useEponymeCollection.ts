import { useAsyncData, useRequestFetch, useRoute } from '#app'
import { useEventListener } from '@vueuse/core'
import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type eponymeConfig from '#eponyme/config'
import type { EponymeCollectionDataByName, EponymeCollectionName } from '../types'
import type { EponymeCollectionEntry, EponymeSortDirection, EponymeStatus, EponymeVersionSelector } from '../server/services/eponyme-store'
import { readPreviewQuery, readPreviewVersion } from '../utils/preview'

type ConfigCollectionName = EponymeCollectionName<typeof eponymeConfig>

/** Sortable keys: the entry metadata plus every field of the collection. */
export type EponymeCollectionSortKey<Name extends ConfigCollectionName>
  = 'updatedAt' | 'publishedAt' | 'title' | 'slug'
    | (keyof EponymeCollectionDataByName<typeof eponymeConfig, Name> & string)

export interface UseEponymeCollectionOptions<Name extends ConfigCollectionName> {
  take?: number
  skip?: number
  orderBy?: EponymeCollectionSortKey<Name>
  order?: EponymeSortDirection
}

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

export function useEponymeCollection<const Name extends ConfigCollectionName>(
  name: Name,
  options: UseEponymeCollectionOptions<Name> = {},
): UseEponymeCollectionResult<EponymeCollectionDataByName<typeof eponymeConfig, Name>> {
  type Data = EponymeCollectionDataByName<typeof eponymeConfig, Name>
  const requestFetch = useRequestFetch()
  const query = {
    take: options.take,
    skip: options.skip,
    orderBy: options.orderBy,
    order: options.order,
  }
  const result = useAsyncData(
    // The options belong in the key, otherwise two differently sorted calls to the
    // same collection would share one cache entry.
    `eponyme:collection:public:${name}:${options.take ?? ''}:${options.skip ?? ''}:${options.orderBy ?? ''}:${options.order ?? ''}`,
    () => requestFetch<{ entries: EponymeCollectionEntry<Data>[], total: number }>(`/api/eponyme-collections/${name}`, { query, cache: 'no-store' }),
    { getCachedData: () => undefined },
  )
  const entries = computed(() => result.data.value?.entries ?? [])
  if (import.meta.client) useEventListener(window, 'focus', () => void result.refresh())

  return {
    entries,
    total: computed(() => result.data.value?.total ?? 0),
    pending: result.pending,
    error: result.error as Ref<Error | null | undefined>,
    refresh: async () => { await result.refresh() },
  }
}

export function useEponymeCollectionEntry<const Name extends ConfigCollectionName>(
  name: Name,
  slug: string,
  options: UseEponymeCollectionEntryOptions = {},
): UseEponymeCollectionEntryResult<EponymeCollectionDataByName<typeof eponymeConfig, Name>> {
  type Data = EponymeCollectionDataByName<typeof eponymeConfig, Name>
  type Response = { data: Data, status: EponymeStatus, publishedAt: string | null }
  const route = useRoute()
  // The preview panel puts the full entry name (`<collection>/<slug>`) in the query.
  const preview = readPreviewQuery(route.query)
  const version = options.version ?? (preview.entry === `${name}/${slug}` ? readPreviewVersion(preview.version) : 'published')
  const requestFetch = useRequestFetch()
  const result = useAsyncData(
    `eponyme:collection-entry:${name}:${slug}:${version}`,
    () => requestFetch<Response>(`/api/eponyme/${name}/${encodeURIComponent(slug)}`, { query: { version }, cache: 'no-store' }),
    { getCachedData: () => undefined },
  )
  if (import.meta.client) useEventListener(window, 'focus', () => void result.refresh())

  return {
    data: result.data as Ref<{ data: Data } | undefined>,
    status: computed(() => result.data.value?.status ?? 'published'),
    publishedAt: computed(() => result.data.value?.publishedAt ?? null),
    pending: result.pending,
    error: result.error as Ref<Error | null | undefined>,
    refresh: async () => { await result.refresh() },
  }
}
