import { clearNuxtData, useAsyncData, useRequestFetch, useRoute } from '#app'
import type { FetchError } from 'ofetch'
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type eponymeConfig from '#eponyme/config'
import type { EponymeDataByName, EponymeName } from '../types'
import type { EponymeAction, EponymeSchedule, EponymeStatus, EponymeVersionSelector } from '../server/services/eponyme-store'
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
}

export interface UseEponymeOptions {
  version?: EponymeVersionSelector
  /** Keep `{{ variables }}` unresolved. The dashboard editor needs the source text. */
  raw?: boolean
}

/**
 * Named, and annotated on the function below, rather than left to inference.
 *
 * An inferred return type has to be expanded when the declaration files are generated, and
 * the expansion loses `typeof eponymeConfig`: it came out as `EponymeDataByName<any, Name>`,
 * which collapses every field to the union of all possible field values. Source and
 * playground were unaffected — they read `src` — so only installed versions of the package
 * lost their types, on the one composable everything else goes through.
 */
export interface UseEponymeResult<Data extends Record<string, unknown>> {
  data: Ref<Data | undefined>
  status: ComputedRef<EponymeStatus>
  publishedAt: ComputedRef<string | null>
  scheduledPublishAt: ComputedRef<string | null>
  scheduledUnpublishAt: ComputedRef<string | null>
  pending: ComputedRef<boolean>
  error: Ref<Error | null | undefined>
  errors: Ref<ValidationErrors>
  refresh: () => Promise<void>
  /** Without a patch, saves the data currently held. Publishes unless told otherwise. */
  save: (patch?: Partial<Data>, action?: EponymeAction, schedule?: EponymeSchedule) => Promise<Data | undefined>
}

/** Read and save a configured eponyme through the public or draft API. */
export function useEponyme<const Name extends ConfigEponymeName>(
  name: Name,
  options: UseEponymeOptions = {},
): UseEponymeResult<EponymeDataByName<typeof eponymeConfig, Name>> {
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
  // Published content answers with a public `Cache-Control`, so the browser cache is
  // allowed to serve it and a client-side navigation costs no round trip. Everything
  // else is unreleased material that must never be stored, whatever the server says.
  //
  const isPublicContent = version === 'published' && !options.raw
  const fetchCache = isPublicContent ? undefined : 'no-store' as const
  // A preview is the one case where a public route is asked for an unreleased version, by
  // its own URL. Rendering it on the server would put draft text in that route's HTML, and
  // a public route is the host's to cache: under `swr`/`isr` nitro stores the rendered
  // response and overwrites the `Cache-Control` set below, so the draft would then be
  // replayed to anonymous visitors without the session ever being re-checked. Fetching it
  // from the browser instead keeps it out of every stored artefact, on any host.
  //
  // An explicit `options.version` is not a preview: that is the dashboard reading its own
  // entry on its own routes, which are authenticated and never cacheable, and it keeps the
  // editor server-rendered.
  const isPreviewRead = options.version === undefined && !isPublicContent
  const { data: response, pending: loading, error, refresh: load } = useAsyncData(
    cacheKey,
    () => requestFetch<EponymeResponse<Name>>(`/api/eponyme/${name}`, { query: { version, raw: options.raw ? 1 : undefined }, cache: fetchCache }),
    { server: !isPreviewRead, getCachedData: cacheForPublicRead(isPublicContent) },
  )
  const data = computed(() => response.value?.data)
  const status = computed(() => response.value?.status ?? 'published')
  const publishedAt = computed(() => response.value?.publishedAt ?? null)
  const scheduledPublishAt = computed(() => response.value?.scheduledPublishAt ?? null)
  const scheduledUnpublishAt = computed(() => response.value?.scheduledUnpublishAt ?? null)

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
        body: action === 'schedule'
          ? { data: patch ?? data.value, ...schedule }
          : patch ?? data.value,
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
    scheduledPublishAt,
    scheduledUnpublishAt,
    pending: computed(() => loading.value || saving.value),
    error: error as Ref<Error | null | undefined>,
    errors,
    refresh,
    save,
  }
}
