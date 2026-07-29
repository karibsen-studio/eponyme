import { clearNuxtData, useAsyncData, useRequestFetch, useRoute } from '#app'
import type { FetchError } from 'ofetch'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type eponymeConfig from '#eponyme/config'
import type { EponymeDataByName, EponymeName } from '../types'
import type { EponymeAction, EponymeStatus, EponymeVersionSelector } from '../server/services/eponyme-store'
import { readPreviewQuery, readPreviewVersion } from '../utils/preview'
import { cacheDuringHydrationOnly } from '../utils/hydration-cache'
import type { ValidationErrors } from '../utils/validate-eponyme-data'

type ConfigEponymeName = EponymeName<typeof eponymeConfig>
type EponymeResponse<Name extends ConfigEponymeName> = {
  data: EponymeDataByName<typeof eponymeConfig, Name>
  status: EponymeStatus
  publishedAt: string | null
}

export interface UseEponymeOptions {
  version?: EponymeVersionSelector
  /** Keep `{{ variables }}` unresolved. The dashboard editor needs the source text. */
  raw?: boolean
}

/** Read and save a configured eponyme through the public or draft API. */
export function useEponyme<const Name extends ConfigEponymeName>(name: Name, options: UseEponymeOptions = {}) {
  type Data = EponymeDataByName<typeof eponymeConfig, Name>
  const route = useRoute()
  const preview = readPreviewQuery(route.query)
  const version = options.version ?? (preview.entry === name ? readPreviewVersion(preview.version) : 'published')
  const errors = ref<ValidationErrors>({})
  const saving = ref(false)
  const requestFetch = useRequestFetch()
  // Built once: publishing clears sibling keys by prefix and has to be able to
  // recognise this exact one, `:raw` suffix included.
  const cacheKey = `eponyme:${name}:${version}${options.raw ? ':raw' : ''}`
  const { data: response, pending: loading, error, refresh: load } = useAsyncData(
    cacheKey,
    () => requestFetch<EponymeResponse<Name>>(`/api/eponyme/${name}`, { query: { version, raw: options.raw ? 1 : undefined }, cache: 'no-store' }),
    { getCachedData: cacheDuringHydrationOnly },
  )
  const data = computed(() => response.value?.data)
  const status = computed(() => response.value?.status ?? 'published')
  const publishedAt = computed(() => response.value?.publishedAt ?? null)

  async function refresh() {
    errors.value = {}
    await load()
  }

  async function save(): Promise<Data | undefined>
  async function save(patch: Partial<Data>, action?: EponymeAction): Promise<Data | undefined>
  async function save(patch?: Partial<Data>, action: EponymeAction = 'publish') {
    saving.value = true
    errors.value = {}
    try {
      const next = await requestFetch<EponymeResponse<Name>>(`/api/eponyme/${name}`, {
        method: 'PATCH',
        query: { action },
        body: patch ?? data.value,
      })
      response.value = next as typeof response.value
      if (action === 'publish') {
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
      if (fetchError.statusCode === 422)
        errors.value = fetchError.data?.errors ?? {}
      throw error
    }
    finally {
      saving.value = false
    }
  }

  return {
    data: data as Ref<Data | undefined>,
    status,
    publishedAt,
    pending: computed(() => loading.value || saving.value),
    error,
    errors,
    refresh,
    save,
  }
}
