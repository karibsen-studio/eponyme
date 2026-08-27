<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useRequestFetch } from '#app'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import type { RelationFieldDefinition } from '../../types'
import type { EponymeCollectionEntry } from '../../server/services/eponyme-store'
import EPButton from '../ui/EPButton.vue'
import EPDialog from '../ui/EPDialog.vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'

/** Short enough that the dialog never becomes a page of its own; the rest is one click away. */
const PER_PAGE = 5

const props = defineProps<{
  id: string
  definition: RelationFieldDefinition
  modelValue: unknown
  label: string
  description?: string
  required?: boolean
  errors?: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const requestFetch = useRequestFetch()
const collection = computed(() => props.definition.options.to)
const multiple = computed(() => Boolean(props.definition.options.multiple))
const maxItems = computed(() => props.definition.options.maxItems)

/** Always a list here, whatever the field stores: one code path for both shapes. */
const selected = computed<string[]>(() => {
  if (multiple.value) return Array.isArray(props.modelValue) ? props.modelValue.filter(slug => typeof slug === 'string') : []
  return typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : []
})

const isFull = computed(() => multiple.value && maxItems.value !== undefined && selected.value.length >= maxItems.value)

const pickerOpen = ref(false)
const search = ref('')
const debouncedSearch = refDebounced(search, 250)
const loading = ref(false)
const entries = ref<EponymeCollectionEntry[]>([])
const total = ref(0)
const hasMore = computed(() => entries.value.length < total.value)

/**
 * Titles of what is already selected, which the current page of the picker rarely contains.
 * Missing from the map means "not loaded yet", never "does not exist" – a target that is gone
 * is refused on save rather than guessed at here.
 */
const titles = ref(new Map<string, string>())

function titleOf(slug: string) {
  return titles.value.get(slug) ?? slug
}

function rememberTitles(rows: EponymeCollectionEntry[]) {
  const next = new Map(titles.value)
  for (const entry of rows) next.set(entry.slug, entry.title)
  titles.value = next
}

/** `append` is what "Load more" asks for; a new search starts the list over instead. */
async function loadEntries(append = false) {
  loading.value = true
  try {
    const response = await requestFetch<{ entries: EponymeCollectionEntry[], total: number }>(
      `/api/eponyme-collections/${collection.value}`,
      {
        query: {
          version: 'draft',
          raw: 1,
          orderBy: 'title',
          order: 'asc',
          take: PER_PAGE,
          skip: append ? entries.value.length : 0,
          search: debouncedSearch.value || undefined,
        },
      },
    )
    entries.value = append ? [...entries.value, ...response.entries] : response.entries
    total.value = response.total
    rememberTitles(response.entries)
  }
  finally {
    loading.value = false
  }
}

/** Resolved one by one: a slug is the primary key, so there is nothing to batch it against. */
async function loadSelectedTitles() {
  const unknown = selected.value.filter(slug => !titles.value.has(slug))
  if (!unknown.length) return
  const rows = await Promise.all(unknown.map(async (slug) => {
    try {
      const entry = await requestFetch<{ data: Record<string, unknown> }>(
        `/api/eponyme/${collection.value}/${encodeURIComponent(slug)}`,
        { query: { version: 'draft', raw: 1 } },
      )
      return { slug, title: String(entry.data.title || slug) }
    }
    catch {
      // Left as its slug: the save is what refuses a target that no longer exists.
      return { slug, title: slug }
    }
  }))
  const next = new Map(titles.value)
  for (const row of rows) next.set(row.slug, row.title)
  titles.value = next
}

watch(selected, () => void loadSelectedTitles(), { immediate: true })

// A new query starts the list over rather than appending to what the previous one had found.
watch(debouncedSearch, () => {
  if (pickerOpen.value) void loadEntries()
})

async function openPicker() {
  if (props.disabled) return
  pickerOpen.value = true
  search.value = ''
  entries.value = []
  await loadEntries()
}

function choose(entry: EponymeCollectionEntry) {
  rememberTitles([entry])
  if (!multiple.value) {
    emit('update:modelValue', entry.slug)
    pickerOpen.value = false
    return
  }
  if (selected.value.includes(entry.slug) || isFull.value) return
  emit('update:modelValue', [...selected.value, entry.slug])
}

function remove(slug: string) {
  if (props.disabled) return
  if (multiple.value) emit('update:modelValue', selected.value.filter(other => other !== slug))
  else emit('update:modelValue', '')
}
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <div class="ep:grid ep:gap-2">
      <ul
        v-if="selected.length"
        class="ep:m-0 ep:grid ep:min-w-0 ep:list-none ep:gap-2 ep:p-0"
      >
        <li
          v-for="slug in selected"
          :key="slug"
          class="ep:flex ep:min-w-0 ep:items-center ep:justify-between ep:gap-3 ep:rounded-xl ep:bg-surface-active/50 ep:px-4 ep:py-3"
        >
          <span class="ep:min-w-0 ep:flex-1">
            <span class="ep:block ep:truncate ep:text-sm ep:font-medium ep:text-text-strong">{{ titleOf(slug) }}</span>
            <span class="ep:mt-0.5 ep:block ep:truncate ep:text-xs ep:text-text-muted">{{ slug }}</span>
          </span>
          <EPButton
            size="sm"
            variant="ghost"
            icon="mingcute:close-line"
            :disabled="disabled"
            :aria-label="t('relation.remove', { entry: titleOf(slug) })"
            @click="remove(slug)"
          />
        </li>
      </ul>

      <EPButton
        :id="id"
        size="sm"
        class="ep:justify-self-start"
        :disabled="disabled || isFull"
        @click="openPicker"
      >
        {{ selected.length && !multiple ? t('relation.change') : t('relation.choose') }}
      </EPButton>
    </div>

    <EPDialog
      :open="pickerOpen"
      :title="t('relation.pickerTitle', { collection: label })"
      :description="t('relation.pickerDescription')"
      @update:open="value => pickerOpen = value"
    >
      <div class="ep:grid ep:min-w-0 ep:gap-3">
        <EPInputText
          v-model="search"
          size="sm"
          type="search"
          :placeholder="t('relation.search')"
          :aria-label="t('relation.search')"
        />

        <p
          v-if="loading && !entries.length"
          class="ep:m-0 ep:text-sm ep:text-text-muted"
        >
          {{ t('action.loading') }}
        </p>
        <p
          v-else-if="!entries.length"
          class="ep:m-0 ep:rounded-xl ep:border ep:border-dashed ep:border-border-default ep:p-6 ep:text-center ep:text-sm ep:text-text-muted"
        >
          {{ search ? t('relation.noMatch', { query: search }) : t('relation.empty') }}
        </p>
        <ul
          v-else
          class="ep:scrollbar-thin ep:m-0 ep:grid ep:max-h-[min(20rem,45vh)] ep:min-w-0 ep:list-none ep:gap-1 ep:overflow-y-auto ep:overscroll-contain ep:p-0"
        >
          <li
            v-for="entry in entries"
            :key="entry.slug"
            class="ep:min-w-0"
          >
            <button
              type="button"
              class="ep:flex ep:w-full ep:min-w-0 ep:cursor-pointer ep:items-center ep:justify-between ep:gap-3 ep:rounded-lg ep:border-0 ep:bg-transparent ep:px-3 ep:py-2.5 ep:text-left ep:transition ep:hover:bg-surface-active ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
              :disabled="selected.includes(entry.slug) || (isFull && !selected.includes(entry.slug))"
              @click="choose(entry)"
            >
              <span class="ep:min-w-0 ep:flex-1">
                <span class="ep:block ep:truncate ep:text-sm ep:text-text-strong">{{ entry.title }}</span>
                <span class="ep:mt-0.5 ep:block ep:truncate ep:text-xs ep:text-text-muted">
                  {{ t(`status.${entry.status}`) }} · {{ entry.slug }}
                </span>
              </span>
              <span
                v-if="selected.includes(entry.slug)"
                class="ep:shrink-0 ep:text-xs ep:text-text-muted"
              >{{ t('relation.selected') }}</span>
            </button>
          </li>
        </ul>

        <div
          v-if="hasMore"
          class="ep:flex ep:items-center ep:justify-between ep:gap-3"
        >
          <p class="ep:m-0 ep:text-xs ep:text-text-muted">
            {{ t('relation.shown', { count: entries.length, total }) }}
          </p>
          <EPButton
            size="sm"
            :loading="loading"
            @click="loadEntries(true)"
          >
            {{ t('relation.loadMore') }}
          </EPButton>
        </div>
      </div>
    </EPDialog>
  </EPFormField>
</template>
