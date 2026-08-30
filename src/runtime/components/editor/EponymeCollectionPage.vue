<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useAsyncData, useRequestFetch, useRoute, useRouter } from '#app'
import type { FetchError } from 'ofetch'
import { watchDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import type { EponymeCollectionDefinitionBase } from '../../types'
import type { EponymeCollectionEntryMeta } from '../../server/services/eponyme-store'
import { getEponymeErrorMessage } from '../../utils/eponyme-error'
import { EPONYME_REVISION_HEADER } from '../../utils/eponyme-revision'
import { normalizeSlug } from '../../utils/normalize-slug'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import { useEponymeNavigation } from '../../composables/useEponymeNavigation'
import EPAlertDialog from '../ui/EPAlertDialog.vue'
import EPButton from '../ui/EPButton.vue'
import EPDialog from '../ui/EPDialog.vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import { EPONYME_DATE_LOCALE } from '../../utils/date-locale'
import { humanizeLabel } from '../../utils/humanize-label'

/** Entries per page. Small enough that a page stays cheap, large enough to scan. */
const PAGE_SIZE = 20

const props = defineProps<{ basePath: string, name: string, definition: EponymeCollectionDefinitionBase }>()
const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()
const createOpen = ref(route.query.create === '1')
const creating = ref(false)
const title = ref('')
const slug = ref('')
const slugTouched = ref(false)
const errors = ref<Record<string, string[]>>({})
const { load: loadNavigation } = useEponymeNavigation()
const searchInput = ref('')
/**
 * Page and search move together as one value: changing the search resets to the first page,
 * and a single source means a single refetch rather than one per part.
 */
const listQuery = ref({ page: 1, search: '' })
const endpoint = computed(() => `/api/eponyme-collections/${props.name}`)
const trashEndpoint = computed(() => `/api/eponyme-trash/${props.name}`)
const auth = useEponymeAuth()
const resource = computed(() => ({ kind: 'collection' as const, name: props.name }))
const canCreate = computed(() => auth.can('content.create', resource.value))
const canTrash = computed(() => auth.can('content.trash', resource.value))
const canRestore = computed(() => auth.can('content.restore', resource.value))
const canPurge = computed(() => auth.can('content.purge', resource.value))
const view = ref<'entries' | 'trash'>('entries')
const duplicateOf = ref<EponymeCollectionEntryMeta>()
const entryAction = ref<{ type: 'trash' | 'purge', entry: EponymeCollectionEntryMeta }>()
const entryActionPending = ref(false)
const entryActionError = ref('')
const restoreError = ref('')

const { data: response, pending, refresh } = useAsyncData(
  `eponyme:collection:${props.name}`,
  // `fields=meta` leaves out the payload of every entry: this list shows titles and dates.
  () => requestFetch<{ entries: EponymeCollectionEntryMeta[], total: number }>(endpoint.value, {
    query: {
      version: 'draft',
      raw: 1,
      fields: 'meta',
      take: PAGE_SIZE,
      skip: (listQuery.value.page - 1) * PAGE_SIZE,
      search: listQuery.value.search || undefined,
    },
  }),
  { watch: [listQuery] },
)

const { data: trashResponse, refresh: refreshTrash } = useAsyncData(
  `eponyme:collection-trash:${props.name}`,
  () => canRestore.value
    ? requestFetch<{ entries: EponymeCollectionEntryMeta[] }>(trashEndpoint.value)
    : Promise.resolve({ entries: [] }),
)
const entries = computed(() => response.value?.entries ?? [])
const total = computed(() => response.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const isSearching = computed(() => listQuery.value.search.length > 0)
/**
 * The page numbers to show: the first, the last, and the ones around the current page.
 * `null` is where a gap is drawn, so a collection of two hundred pages still fits.
 */
const pageItems = computed<Array<number | null>>(() => {
  const last = pageCount.value
  const current = listQuery.value.page
  const shown = new Set([1, last, current, current - 1, current + 1])
  const items: Array<number | null> = []
  for (let page = 1; page <= last; page++) {
    if (!shown.has(page)) {
      if (items.at(-1) !== null) items.push(null)
      continue
    }
    items.push(page)
  }
  return items
})

function goToPage(page: number) {
  listQuery.value = { ...listQuery.value, page: Math.min(Math.max(1, page), pageCount.value) }
}
const trashEntries = computed(() => trashResponse.value?.entries ?? [])
const label = computed(() => props.definition.label || humanize(props.name.split('/').at(-1) || props.name))
const addLabel = computed(() => props.definition.addLabel || t('collection.create'))

watch(title, (value) => {
  if (!slugTouched.value) slug.value = normalizeSlug(value)
})
watch(() => route.query.create, value => createOpen.value = value === '1')
watchDebounced(searchInput, value => listQuery.value = { page: 1, search: value.trim() }, { debounce: 300 })

/** The sidebar holds its own window on the collection, so a write here refreshes both. */
async function refreshEntries() {
  await Promise.all([refresh(), loadNavigation()])
}

function humanize(value: string) {
  return humanizeLabel(value)
}

function truncateTitle(value: string, maxLength = 48) {
  const characters = [...value]
  if (characters.length <= maxLength) return value
  return `${characters.slice(0, maxLength - 1).join('')}…`
}

function setSlug(value: string | number) {
  slugTouched.value = true
  slug.value = normalizeSlug(String(value))
}

function resetCreateForm() {
  title.value = ''
  slug.value = ''
  slugTouched.value = false
  duplicateOf.value = undefined
  errors.value = {}
}

/**
 * Reuses the create dialog: a copy is a new entry that happens to start from another one's
 * draft, so it goes through the same endpoint, the same validation and the same slug rules.
 */
function duplicateEntry(entry: EponymeCollectionEntryMeta) {
  duplicateOf.value = entry
  slugTouched.value = false
  title.value = t('collection.copyOf', { title: entry.title })
  slug.value = normalizeSlug(title.value)
  errors.value = {}
  createOpen.value = true
}

async function setCreateOpen(open: boolean) {
  createOpen.value = open
  if (!open) {
    resetCreateForm()
    if (route.query.create === '1') {
      const query = { ...route.query }
      delete query.create
      await router.replace({ query })
    }
  }
}

async function createEntry() {
  creating.value = true
  errors.value = {}
  try {
    // Read at submit rather than when the dialog opened, so a copy carries what the entry
    // holds now – and only the draft, since that is what a new entry starts as.
    const source = duplicateOf.value
      ? (await requestFetch<{ data: Record<string, unknown> }>(`/api/eponyme/${props.name}/${encodeURIComponent(duplicateOf.value.slug)}`, {
          query: { version: 'draft', raw: 1 },
        })).data
      : {}
    const result = await requestFetch<{ slug: string }>(endpoint.value, {
      method: 'POST',
      body: {
        ...source,
        [props.definition.titleField]: title.value,
        [props.definition.slugField]: slug.value,
      },
    })
    await refreshEntries()
    await setCreateOpen(false)
    await router.push(`${props.basePath}/${props.name}/${result.slug}`)
  }
  catch (error) {
    const fetchError = error as FetchError<{ errors?: Record<string, string[]> }>
    errors.value = fetchError.data?.errors ?? { _form: [t('collection.createFailed')] }
  }
  finally {
    creating.value = false
  }
}

function requestEntryAction(type: 'trash' | 'purge', entry: EponymeCollectionEntryMeta) {
  entryAction.value = { type, entry }
  entryActionError.value = ''
}

async function restoreEntry(entry: EponymeCollectionEntryMeta) {
  restoreError.value = ''
  try {
    await requestFetch(`${trashEndpoint.value}/${entry.slug}`, {
      method: 'PATCH',
      headers: revisionHeaders(entry),
    })
    await Promise.all([refreshEntries(), refreshTrash()])
    if (!trashEntries.value.length) view.value = 'entries'
  }
  catch (caught) {
    restoreError.value = getEponymeErrorMessage(caught, t('collection.restoreFailed'))
    await refreshTrash()
  }
}

/**
 * The version the listing showed this entry at. Trashing and restoring both hide or bring
 * back content someone else may have edited since the list was loaded, so the server checks
 * it against the row before touching it.
 */
function revisionHeaders(entry: EponymeCollectionEntryMeta) {
  return entry.updatedAt ? { [EPONYME_REVISION_HEADER]: entry.updatedAt } : undefined
}

function setEntryActionOpen(open: boolean) {
  if (open || entryActionPending.value) return
  entryAction.value = undefined
  entryActionError.value = ''
}

async function confirmEntryAction() {
  const action = entryAction.value
  if (!action || entryActionPending.value) return
  entryActionPending.value = true
  entryActionError.value = ''
  try {
    if (action.type === 'trash') {
      await requestFetch(`${endpoint.value}/${action.entry.slug}`, {
        method: 'DELETE',
        headers: revisionHeaders(action.entry),
      })
      await Promise.all([refreshEntries(), refreshTrash()])
    }
    else {
      await requestFetch(`${trashEndpoint.value}/${action.entry.slug}`, { method: 'DELETE' })
      await refreshTrash()
      if (!trashEntries.value.length) view.value = 'entries'
    }
    entryAction.value = undefined
  }
  catch (caught) {
    entryActionError.value = getEponymeErrorMessage(
      caught,
      t(action.type === 'trash' ? 'collection.trashFailed' : 'collection.purgeFailed'),
    )
  }
  finally {
    entryActionPending.value = false
  }
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(EPONYME_DATE_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
}
</script>

<template>
  <section class="ep:mx-auto ep:w-full ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <header class="ep:flex ep:flex-wrap ep:items-start ep:justify-between ep:gap-4">
      <div>
        <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
          {{ label }}
        </h1>
        <p
          v-if="definition.description"
          class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-text-muted"
        >
          {{ definition.description }}
        </p>
      </div>
      <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
        <EPButton
          v-if="canRestore && trashEntries.length"
          size="md"
          :variant="view === 'trash' ? 'primary' : 'secondary'"
          @click="view = view === 'trash' ? 'entries' : 'trash'"
        >
          {{ t('collection.trash', { count: trashEntries.length }) }}
        </EPButton>
        <EPButton
          v-if="canCreate"
          variant="primary"
          @click="createOpen = true"
        >
          {{ addLabel }}
        </EPButton>
      </div>
    </header>

    <div
      v-if="view === 'entries' && (total || isSearching)"
      class="ep:relative ep:mt-6"
    >
      <Icon
        name="mingcute:search-line"
        size="17"
        aria-hidden="true"
        class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:left-3 ep:-translate-y-1/2 ep:text-text-muted"
      />
      <EPInputText
        v-model="searchInput"
        padded
        type="search"
        :placeholder="t('collection.search')"
        :aria-label="t('collection.searchLabel')"
      />
    </div>

    <div
      v-if="view === 'trash'"
      class="ep:mt-8 ep:grid ep:gap-3"
    >
      <p class="ep:m-0 ep:text-sm ep:text-text-muted">
        {{ t('collection.trashHint') }}
      </p>
      <p
        v-if="restoreError"
        role="alert"
        class="ep:m-0 ep:rounded-lg ep:bg-danger/10 ep:p-3 ep:text-sm ep:text-danger"
      >
        {{ restoreError }}
      </p>
      <article
        v-for="entry in trashEntries"
        :key="entry.slug"
        class="ep:flex ep:min-w-0 ep:flex-col ep:items-stretch ep:justify-between ep:gap-3 ep:rounded-xl ep:bg-surface-active/50 ep:p-4 ep:md:flex-row ep:md:items-center"
      >
        <div
          class="ep:min-w-0 ep:flex-1"
          :title="entry.title"
        >
          <span class="ep:block ep:min-w-0 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:text-sm ep:font-semibold ep:text-text-strong">{{ truncateTitle(entry.title) }}</span>
          <span class="ep:mt-1 ep:block ep:text-xs ep:text-text-muted">{{ entry.deletedAt ? t('collection.deletedOn', { date: formatDate(entry.deletedAt) }) : t('collection.deleted') }}</span>
        </div>
        <div class="ep:flex ep:shrink-0 ep:gap-2">
          <EPButton
            v-if="canRestore"
            size="sm"
            class="ep:flex-1 ep:md:flex-none"
            @click="restoreEntry(entry)"
          >
            {{ t('action.restore') }}
          </EPButton>
          <EPButton
            v-if="canPurge"
            size="sm"
            variant="danger"
            class="ep:flex-1 ep:md:flex-none"
            @click="requestEntryAction('purge', entry)"
          >
            {{ t('collection.purge') }}
          </EPButton>
        </div>
      </article>
    </div>

    <p
      v-else-if="pending"
      class="ep:mt-8 ep:text-sm ep:text-text-muted"
    >
      {{ t('action.loading') }}
    </p>
    <div
      v-else-if="entries.length"
      class="ep:mt-8 ep:grid ep:gap-3"
    >
      <article
        v-for="entry in entries"
        :key="entry.slug"
        class="ep:group ep:flex ep:min-w-0 ep:flex-col ep:items-stretch ep:justify-between ep:gap-3 ep:rounded-xl ep:bg-surface-active/50 ep:p-4 ep:md:flex-row ep:md:items-center ep:md:gap-4"
      >
        <NuxtLink
          :to="`${basePath}/${name}/${entry.slug}`"
          :title="entry.title"
          class="ep:min-w-0 ep:flex-1 ep:no-underline"
        >
          <span class="ep:flex ep:min-w-0 ep:items-center ep:gap-2">
            <span class="ep:min-w-0 ep:flex-1 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:text-sm ep:font-semibold ep:text-text-strong">{{ truncateTitle(entry.title) }}</span>
          </span>
          <span class="ep:mt-1 ep:block ep:text-xs ep:text-text-muted">
            {{ t(`status.${entry.status}`) }}<template v-if="entry.updatedAt"> · {{ formatDate(entry.updatedAt) }}</template>
            <template v-if="entry.scheduledPublishAt"><br>{{ t('collection.scheduledPublish', { date: formatDate(entry.scheduledPublishAt) }) }}</template>
            <template v-if="entry.scheduledUnpublishAt"><br>{{ t('collection.scheduledUnpublish', { date: formatDate(entry.scheduledUnpublishAt) }) }}</template>
          </span>
        </NuxtLink>
        <div
          v-if="canCreate || canTrash"
          class="ep:flex ep:shrink-0 ep:gap-2 ep:md:opacity-0 ep:md:group-hover:opacity-100 ep:md:focus-within:opacity-100"
        >
          <EPButton
            v-if="canCreate"
            size="sm"
            class="ep:flex-1 ep:md:flex-none"
            :title="t('collection.duplicateTitle')"
            @click="duplicateEntry(entry)"
          >
            {{ t('action.duplicate') }}
          </EPButton>
          <EPButton
            v-if="canTrash"
            size="sm"
            variant="danger"
            class="ep:flex-1 ep:md:flex-none"
            @click="requestEntryAction('trash', entry)"
          >
            {{ t('action.delete') }}
          </EPButton>
        </div>
      </article>
    </div>
    <div
      v-else
      class="ep:mt-8 ep:rounded-xl ep:border ep:border-dashed ep:border-border-default ep:p-8 ep:text-center"
    >
      <p class="ep:m-0 ep:text-sm ep:text-text-muted">
        {{ isSearching ? t('collection.noMatch', { query: listQuery.search }) : t('collection.empty') }}
      </p>
      <EPButton
        v-if="canCreate && !isSearching"
        class="ep:mt-4"
        @click="createOpen = true"
      >
        {{ t('collection.createFirst') }}
      </EPButton>
    </div>

    <nav
      v-if="view === 'entries' && pageCount > 1"
      class="ep:mt-6 ep:flex ep:flex-wrap ep:items-center ep:justify-center ep:gap-1"
      :aria-label="t('collection.pagination')"
    >
      <EPButton
        size="icon"
        variant="ghost"
        icon="mingcute:left-line"
        :disabled="listQuery.page <= 1"
        :aria-label="t('action.previous')"
        @click="goToPage(listQuery.page - 1)"
      />
      <template
        v-for="(item, index) in pageItems"
        :key="item ?? `gap-${index}`"
      >
        <span
          v-if="item === null"
          class="ep:px-1 ep:text-sm ep:text-text-muted"
        >…</span>
        <EPButton
          v-else
          size="sm"
          :variant="item === listQuery.page ? 'primary' : 'ghost'"
          :aria-current="item === listQuery.page ? 'page' : undefined"
          @click="goToPage(item)"
        >
          {{ item }}
        </EPButton>
      </template>
      <EPButton
        size="icon"
        variant="ghost"
        icon="mingcute:right-line"
        :disabled="listQuery.page >= pageCount"
        :aria-label="t('action.next')"
        @click="goToPage(listQuery.page + 1)"
      />
    </nav>
    <p
      v-if="view === 'entries' && total"
      class="ep:mt-3 ep:text-center ep:text-xs ep:text-text-muted"
    >
      {{ t('collection.results', { count: total }) }}<template v-if="pageCount > 1">
        · {{ t('collection.page', { page: listQuery.page, pages: pageCount }) }}
      </template>
    </p>

    <EPDialog
      :open="createOpen && canCreate"
      :title="duplicateOf ? t('collection.duplicateTitle') : definition.addLabel || t('collection.createTitle')"
      :description="duplicateOf ? t('collection.duplicateDescription', { title: duplicateOf.title }) : t('collection.createDescription')"
      @update:open="setCreateOpen"
    >
      <form
        class="ep:grid ep:gap-4"
        @submit.prevent="createEntry"
      >
        <EPFormField
          :id="`collection-${name}-title`"
          :label="humanize(definition.titleField)"
          required
          :errors="errors[definition.titleField]"
        >
          <EPInputText
            :id="`collection-${name}-title`"
            v-model="title"
            autofocus
            :invalid="Boolean(errors[definition.titleField]?.length)"
          />
        </EPFormField>
        <EPFormField
          :id="`collection-${name}-slug`"
          :label="humanize(definition.slugField)"
          required
          :errors="errors[definition.slugField]"
        >
          <EPInputText
            :id="`collection-${name}-slug`"
            :model-value="slug"
            :invalid="Boolean(errors[definition.slugField]?.length)"
            @update:model-value="setSlug"
          />
        </EPFormField>
        <p
          v-if="errors._form"
          class="ep:m-0 ep:text-xs ep:text-danger"
        >
          {{ errors._form.join(' ') }}
        </p>
        <div class="ep:flex ep:justify-end ep:gap-2">
          <EPButton @click="setCreateOpen(false)">
            {{ t('action.cancel') }}
          </EPButton>
          <EPButton
            type="submit"
            variant="primary"
            :loading="creating"
          >
            {{ duplicateOf ? t('action.duplicate') : t('action.create') }}
          </EPButton>
        </div>
      </form>
    </EPDialog>

    <EPAlertDialog
      :open="Boolean(entryAction)"
      :label="entryAction ? t(entryAction.type === 'trash' ? 'collection.trashTitle' : 'collection.purgeTitle') : ''"
      :description="entryAction ? t(entryAction.type === 'trash' ? 'collection.trashDescription' : 'collection.purgeDescription', { title: entryAction.entry.title }) : ''"
      :confirm-label="entryAction ? t(entryAction.type === 'trash' ? 'collection.trashAction' : 'collection.purgeAction') : ''"
      confirm-variant="danger"
      :confirm-loading="entryActionPending"
      :close-on-confirm="false"
      @update:open="setEntryActionOpen"
      @confirm="confirmEntryAction"
    >
      <p
        v-show="entryActionError"
        role="alert"
        class="ep:m-0 ep:rounded-lg ep:bg-danger/10 ep:p-3 ep:text-sm ep:text-danger"
      >
        {{ entryActionError }}
      </p>
    </EPAlertDialog>
  </section>
</template>
