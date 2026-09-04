import { clearNuxtData, useAsyncData, useRequestFetch, useRoute } from '#app'
import type { FetchError } from 'ofetch'
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type eponymeConfig from '#eponyme/config'
import type { EponymeDataByName, EponymeName } from '../types'
import type { EponymeAction, EponymeSchedule, EponymeStatus, EponymeVersionSelector } from '../server/services/eponyme-store'
import { EPONYME_REVISION_HEADER } from '../utils/eponyme-revision'
import { readPreviewQuery, readPreviewVersion } from '../utils/preview'
import { cacheForPublicRead } from '../utils/hydration-cache'
import type { ValidationErrors } from '../utils/validate-eponyme-data'

type ConfigEponymeName = EponymeName<typeof eponymeConfig>
type EponymeResponse<Name extends ConfigEponymeName> = {
  data: EponymeDataByName<typeof eponymeConfig, Name>
  status: EponymeStatus
  publishedAt: string | null
  scheduledPublishAt: string | null
  scheduledUnpublishAt: string | null
  revision: string | null
}

export interface UseEponymeOptions {
  version?: EponymeVersionSelector
  /** Keep `{{ variables }}` unresolved. The dashboard editor needs the source text. */
  raw?: boolean
}

/** Named, and annotated on the function below, rather than left to inference. */
export interface UseEponymeResult<Data extends Record<string, unknown>> {
  data: Ref<Data | undefined>
  status: ComputedRef<EponymeStatus>
  publishedAt: ComputedRef<string | null>
  scheduledPublishAt: ComputedRef<string | null>
  scheduledUnpublishAt: ComputedRef<string | null>
  /**
   * The version this data was read at, sent back with every write so a save made against content someone
   * else has already replaced is refused rather than silently applied.
   */
  revision: ComputedRef<string | null>
  pending: ComputedRef<boolean>
  error: Ref<Error | null | undefined>
  errors: Ref<ValidationErrors>
  refresh: () => Promise<void>
  /** Without a patch, saves the data currently held. Publishes unless told otherwise. */
  save: (patch?: Partial<Data>, action?: EponymeAction, schedule?: EponymeSchedule) => Promise<Data | undefined>
}

/** What the composable hands back: the refs, and a promise resolving to them. */
export type UseEponymeReturn<Data extends Record<string, unknown>>
  = UseEponymeResult<Data> & Promise<UseEponymeResult<Data>>

/** Read and save a configured eponyme through the public or draft API. */
export function useEponyme<const Name extends ConfigEponymeName>(
  name: Name,
  options: UseEponymeOptions = {},
): UseEponymeReturn<EponymeDataByName<typeof eponymeConfig, Name>> {
  type Data = EponymeDataByName<typeof eponymeConfig, Name>
  const route = useRoute()
  const preview = readPreviewQuery(route.query)
  const version = options.version ?? (preview.entry === name ? readPreviewVersion(preview.version) : 'published')
  const errors = ref<ValidationErrors>({})
  const saving = ref(false)
  const requestFetch = useRequestFetch()
  // Built once: publishing clears sibling keys by prefix and has to be able to recognise this exact one,
  // `:raw` suffix included.
  const cacheKey = `eponyme:${name}:${version}${options.raw ? ':raw' : ''}`
  // Published content answers with a public `Cache-Control`, so the browser cache is allowed to serve it
  // and a client-side navigation costs no round trip.
  const isPublicContent = version === 'published' && !options.raw
  const fetchCache = isPublicContent ? undefined : 'no-store' as const
  // A preview is the one case where a public route is asked for an unreleased version, by its own URL.
  const isPreviewRead = options.version === undefined && !isPublicContent
  const result = useAsyncData(
    cacheKey,
    () => requestFetch<EponymeResponse<Name>>(`/api/eponyme/${name}`, { query: { version, raw: options.raw ? 1 : undefined }, cache: fetchCache }),
    { server: !isPreviewRead, getCachedData: cacheForPublicRead(isPublicContent) },
  )
  const { data: response, pending: loading, error, refresh: load } = result
  const data = computed(() => response.value?.data)
  const status = computed(() => response.value?.status ?? 'published')
  const publishedAt = computed(() => response.value?.publishedAt ?? null)
  const scheduledPublishAt = computed(() => response.value?.scheduledPublishAt ?? null)
  const scheduledUnpublishAt = computed(() => response.value?.scheduledUnpublishAt ?? null)
  const revision = computed(() => response.value?.revision ?? null)

  async function refresh() {
    errors.value = {}
    await load()
  }

  async function save(): Promise<Data | undefined>
  async function save(patch: Partial<Data>, action?: EponymeAction, schedule?: EponymeSchedule): Promise<Data | undefined>
  async function save(patch?: Partial<Data>, action: EponymeAction = 'publish', schedule: EponymeSchedule = {}) {
    saving.value = true
    errors.value = {}
    try {
      const next = await requestFetch<EponymeResponse<Name>>(`/api/eponyme/${name}`, {
        method: 'PATCH',
        query: { action },
        // The response carries the revision the write landed on, and replacing `response` below adopts it -
        // so a second save locks on the first one rather than on the version the page was opened at.
        headers: revision.value ? { [EPONYME_REVISION_HEADER]: revision.value } : undefined,
        body: action === 'draft'
          ? patch ?? data.value
          : action === 'schedule'
            ? schedule
            : {},
      })
      response.value = next as typeof response.value
      if (action !== 'draft') {
        // Keys are versioned, so match by prefix to drop every cached version.
        clearNuxtData(key => key.startsWith(`eponyme:${name}:`) && key !== cacheKey)
        const parts = String(name).split('/')
        const slug = parts.pop()
        const collectionName = parts.join('/')
        if (collectionName && slug) {
          clearNuxtData(key => key.startsWith(`eponyme:collection:public:${collectionName}`))
          clearNuxtData(key => key.startsWith(`eponyme:collection-entry:${collectionName}:${slug}:`))
        }
      }
      return next.data
    }
    catch (error) {
      const fetchError = error as FetchError<{ errors?: ValidationErrors }>
      if (fetchError.status === 422)
        errors.value = fetchError.data?.errors ?? {}
      throw error
    }
    finally {
      saving.value = false
    }
  }

  const api: UseEponymeResult<Data> = {
    data: data as Ref<Data | undefined>,
    status,
    publishedAt,
    scheduledPublishAt,
    scheduledUnpublishAt,
    revision,
    pending: computed(() => loading.value || saving.value),
    error: error as Ref<Error | null | undefined>,
    errors,
    refresh,
    save,
  }
  return Object.assign(result.then(() => api), api)
}
