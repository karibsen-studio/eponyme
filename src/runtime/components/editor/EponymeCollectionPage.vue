<script setup lang="ts">
import { useAsyncData, useRequestFetch, useRoute, useRouter, useState } from '#app'
import type { FetchError } from 'ofetch'
import { computed, ref, watch } from 'vue'
import type { EponymeCollectionDefinitionBase } from '../../types'
import type { EponymeCollectionEntry } from '../../server/services/eponyme-store'
import { normalizeSlug } from '../../utils/normalize-slug'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import EPButton from '../ui/EPButton.vue'
import EPDialog from '../ui/EPDialog.vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import { EPONYME_DATE_LOCALE } from '../../utils/date-locale'

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
const collectionEntries = useState<Record<string, EponymeCollectionEntry[]>>('eponyme:collection-entries', () => ({}))
const endpoint = computed(() => `/api/eponyme-collections/${props.name}`)
const trashEndpoint = computed(() => `/api/eponyme-trash/${props.name}`)
const auth = useEponymeAuth()
const view = ref<'entries' | 'trash'>('entries')

const { data: response, pending, refresh } = useAsyncData(
  `eponyme:collection:${props.name}`,
  () => requestFetch<{ entries: EponymeCollectionEntry[] }>(endpoint.value, { query: { version: 'draft', raw: 1 } }),
)
// Loaded alongside the list rather than on demand, so the header can show the count.
const { data: trashResponse, refresh: refreshTrash } = useAsyncData(
  `eponyme:collection-trash:${props.name}`,
  () => auth.canEdit.value
    ? requestFetch<{ entries: EponymeCollectionEntry[] }>(trashEndpoint.value)
    : Promise.resolve({ entries: [] }),
)
const entries = computed(() => response.value?.entries ?? [])
const trashEntries = computed(() => trashResponse.value?.entries ?? [])
const label = computed(() => props.definition.label || humanize(props.name.split('/').at(-1) || props.name))

watch(title, (value) => {
  if (!slugTouched.value) slug.value = normalizeSlug(value)
})
watch(() => route.query.create, value => createOpen.value = value === '1')
watch(entries, value => collectionEntries.value = { ...collectionEntries.value, [props.name]: value }, { immediate: true })

function humanize(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
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
  errors.value = {}
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
    const result = await requestFetch<{ slug: string }>(endpoint.value, {
      method: 'POST',
      body: {
        [props.definition.titleField]: title.value,
        [props.definition.slugField]: slug.value,
      },
    })
    await refresh()
    await setCreateOpen(false)
    await router.push(`${props.basePath}/${props.name}/${result.slug}`)
  }
  catch (error) {
    const fetchError = error as FetchError<{ errors?: Record<string, string[]> }>
    errors.value = fetchError.data?.errors ?? { _form: ['Unable to create this entry.'] }
  }
  finally {
    creating.value = false
  }
}

async function deleteEntry(entry: EponymeCollectionEntry) {
  if (!confirm(`Move “${entry.title}” to the trash? Its slug stays reserved until you restore it or delete it for good.`)) return
  await requestFetch(`${endpoint.value}/${entry.slug}`, { method: 'DELETE' })
  await Promise.all([refresh(), refreshTrash()])
}

async function restoreEntry(entry: EponymeCollectionEntry) {
  await requestFetch(`${trashEndpoint.value}/${entry.slug}`, { method: 'PATCH' })
  await Promise.all([refresh(), refreshTrash()])
  if (!trashEntries.value.length) view.value = 'entries'
}

async function purgeEntry(entry: EponymeCollectionEntry) {
  if (!confirm(`Permanently delete “${entry.title}”? Its content and its whole history are lost. This cannot be undone.`)) return
  await requestFetch(`${trashEndpoint.value}/${entry.slug}`, { method: 'DELETE' })
  await refreshTrash()
  if (!trashEntries.value.length) view.value = 'entries'
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(EPONYME_DATE_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
}
</script>

<template>
  <section class="ep:mx-auto ep:w-full ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <header class="ep:flex ep:flex-wrap ep:items-start ep:justify-between ep:gap-4">
      <div>
        <p class="ep:m-0 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
          Collection
        </p>
        <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white">
          {{ label }}
        </h1>
        <p
          v-if="definition.description"
          class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-muted-ep"
        >
          {{ definition.description }}
        </p>
      </div>
      <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
        <EPButton
          v-if="auth.canEdit.value && trashEntries.length"
          size="md"
          :variant="view === 'trash' ? 'primary' : 'secondary'"
          @click="view = view === 'trash' ? 'entries' : 'trash'"
        >
          Trash ({{ trashEntries.length }})
        </EPButton>
        <EPButton
          v-if="auth.canEdit.value"
          variant="primary"
          @click="createOpen = true"
        >
          + New {{ humanize(name.split('/').at(-1) || 'entry').replace(/s$/, '') }}
        </EPButton>
      </div>
    </header>

    <div
      v-if="view === 'trash'"
      class="ep:mt-8 ep:grid ep:gap-3"
    >
      <p class="ep:m-0 ep:text-sm ep:text-muted-ep">
        Trashed entries keep their history and their slug. Restore one to bring it back.
      </p>
      <article
        v-for="entry in trashEntries"
        :key="entry.slug"
        class="ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3 ep:rounded-xl ep:bg-selected-ep/50 ep:p-4"
      >
        <div
          class="ep:min-w-0 ep:flex-1"
          :title="entry.title"
        >
          <span class="ep:block ep:min-w-0 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:text-sm ep:font-semibold ep:text-white">{{ truncateTitle(entry.title) }}</span>
          <span class="ep:mt-1 ep:block ep:text-xs ep:text-muted-ep">{{ entry.deletedAt ? `Deleted ${formatDate(entry.deletedAt)}` : 'Deleted' }}</span>
        </div>
        <div class="ep:flex ep:shrink-0 ep:gap-2">
          <EPButton
            size="sm"
            @click="restoreEntry(entry)"
          >
            Restore
          </EPButton>
          <EPButton
            v-if="auth.isOwner.value"
            size="sm"
            variant="danger"
            @click="purgeEntry(entry)"
          >
            Delete for good
          </EPButton>
        </div>
      </article>
    </div>

    <p
      v-else-if="pending"
      class="ep:mt-8 ep:text-sm ep:text-muted-ep"
    >
      Loading…
    </p>
    <div
      v-else-if="entries.length"
      class="ep:mt-8 ep:grid ep:gap-3"
    >
      <article
        v-for="entry in entries"
        :key="entry.slug"
        class="ep:group ep:flex ep:items-center ep:justify-between ep:gap-4 ep:rounded-xl ep:bg-selected-ep/50 ep:p-4"
      >
        <NuxtLink
          :to="`${basePath}/${name}/${entry.slug}`"
          :title="entry.title"
          class="ep:min-w-0 ep:flex-1 ep:no-underline"
        >
          <span class="ep:flex ep:min-w-0 ep:items-center ep:gap-2">
            <span class="ep:min-w-0 ep:flex-1 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:text-sm ep:font-semibold ep:text-white">{{ truncateTitle(entry.title) }}</span>
          </span>
          <span class="ep:mt-1 ep:block ep:text-xs ep:text-muted-ep ep:capitalize">{{ entry.status }}<template v-if="entry.updatedAt"> · {{ formatDate(entry.updatedAt) }}</template></span>
        </NuxtLink>
        <EPButton
          v-if="auth.canEdit.value"
          size="sm"
          variant="danger"
          class="ep:shrink-0 ep:md:opacity-0 ep:md:group-hover:opacity-100 ep:md:focus-visible:opacity-100"
          @click="deleteEntry(entry)"
        >
          Delete
        </EPButton>
      </article>
    </div>
    <div
      v-else
      class="ep:mt-8 ep:rounded-xl ep:border ep:border-dashed ep:border-border-ep ep:p-8 ep:text-center"
    >
      <p class="ep:m-0 ep:text-sm ep:text-muted-ep">
        No entries yet.
      </p>
      <EPButton
        v-if="auth.canEdit.value"
        class="ep:mt-4"
        @click="createOpen = true"
      >
        Create the first one
      </EPButton>
    </div>

    <EPDialog
      :open="createOpen && auth.canEdit.value"
      :title="`New ${label.replace(/s$/, '')}`"
      description="Give the entry a title and a permanent URL slug."
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
          class="ep:m-0 ep:text-xs ep:text-danger-ep"
        >
          {{ errors._form.join(' ') }}
        </p>
        <div class="ep:flex ep:justify-end ep:gap-2">
          <EPButton @click="setCreateOpen(false)">
            Cancel
          </EPButton>
          <EPButton
            type="submit"
            variant="primary"
            :loading="creating"
          >
            Create
          </EPButton>
        </div>
      </form>
    </EPDialog>
  </section>
</template>
