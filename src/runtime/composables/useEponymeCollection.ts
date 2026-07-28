import { useAsyncData, useRequestFetch, useRoute } from '#app'
import { useEventListener } from '@vueuse/core'
import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type eponymeConfig from '#eponyme/config'
import type { EponymeCollectionDataByName, EponymeCollectionName } from '../types'
import type { EponymeCollectionEntry, EponymeStatus, EponymeVersionSelector } from '../server/services/eponyme-store'
import { readPreviewQuery, readPreviewVersion } from '../utils/preview'

type ConfigCollectionName = EponymeCollectionName<typeof eponymeConfig>

export interface UseEponymeCollectionResult<Data extends Record<string, unknown>> {
  entries: ComputedRef<EponymeCollectionEntry<Data>[]>
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

export function useEponymeCollection<const Name extends ConfigCollectionName>(name: Name): UseEponymeCollectionResult<EponymeCollectionDataByName<typeof eponymeConfig, Name>> {
  type Data = EponymeCollectionDataByName<typeof eponymeConfig, Name>
  const requestFetch = useRequestFetch()
  const result = useAsyncData(
    `eponyme:collection:public:${name}`,
    () => requestFetch<{ entries: EponymeCollectionEntry<Data>[] }>(`/api/eponyme-collections/${name}`, { cache: 'no-store' }),
    { getCachedData: () => undefined },
  )
  const entries = computed(() => result.data.value?.entries ?? [])
  if (import.meta.client) useEventListener(window, 'focus', () => void result.refresh())

  return {
    entries,
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
