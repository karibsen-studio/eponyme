<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed } from 'vue'
import EPButton from '../ui/EPButton.vue'
import { formatEponymeBytes } from '../../composables/useEponymeMedia'
import type { EponymeMediaItem } from '../../types/storage'

const props = withDefaults(defineProps<{
  items: EponymeMediaItem[]
  pending?: boolean
  query?: string
  /** Highlighted as the current choice, by key. */
  selected?: string
  /** Restricts what can be picked, without hiding the rest of the library. */
  accept?: string[]
  hasMore?: boolean
  deletable?: boolean
}>(), { query: '', accept: () => [] })

const emit = defineEmits<{
  select: [item: EponymeMediaItem]
  remove: [item: EponymeMediaItem]
  loadMore: []
}>()

const visible = computed(() => {
  const query = props.query.trim().toLowerCase()
  if (!query) return props.items
  return props.items.filter(item => fileName(item.key).toLowerCase().includes(query))
})

function fileName(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1)
}

function isImage(item: EponymeMediaItem): boolean {
  return item.contentType.startsWith('image/')
}

/** A file outside the field's `accept` stays visible but cannot be chosen, so it is clear it exists. */
function isPickable(item: EponymeMediaItem): boolean {
  if (!props.accept.length) return true
  return props.accept.some(pattern => (
    pattern === '*' || pattern === '*/*'
      ? true
      : pattern.endsWith('/*') ? item.contentType.startsWith(pattern.slice(0, -1)) : pattern === item.contentType
  ))
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}
</script>

<template>
  <div>
    <ul
      v-if="visible.length"
      class="ep:m-0 ep:grid ep:list-none ep:grid-cols-2 ep:gap-3 ep:p-0 ep:lg:grid-cols-3"
    >
      <li
        v-for="item in visible"
        :key="item.key"
        class="ep:relative ep:overflow-hidden ep:rounded-xl ep:border ep:transition"
        :class="item.key === selected ? 'ep:border-contrast' : 'ep:border-border-default'"
      >
        <button
          type="button"
          class="ep:flex ep:w-full ep:cursor-pointer ep:flex-col ep:gap-0 ep:border-0 ep:bg-transparent ep:p-0 ep:text-left ep:disabled:cursor-not-allowed ep:disabled:opacity-40"
          :disabled="!isPickable(item)"
          :aria-current="item.key === selected ? 'true' : undefined"
          @click="emit('select', item)"
        >
          <span class="ep:flex ep:aspect-video ep:w-full ep:items-center ep:justify-center ep:overflow-hidden ep:bg-surface-active">
            <img
              v-if="isImage(item)"
              :src="item.url"
              :alt="fileName(item.key)"
              loading="lazy"
              class="ep:h-full ep:w-full ep:object-cover"
            >
            <Icon
              v-else
              name="mingcute:file-line"
              size="28"
              aria-hidden="true"
              class="ep:text-text-muted"
            />
          </span>
          <span class="ep:block ep:min-w-0 ep:px-3 ep:py-2">
            <span class="ep:block ep:truncate ep:text-xs ep:font-medium ep:text-text-strong">{{ fileName(item.key) }}</span>
            <span class="ep:block ep:text-[11px] ep:text-text-muted">
              {{ formatEponymeBytes(item.size) }} · {{ formatDate(item.lastModified) }}
            </span>
          </span>
        </button>
        <span
          v-if="deletable"
          class="ep:absolute ep:top-1.5 ep:right-1.5 ep:rounded-lg ep:bg-surface-raised"
        >
          <EPButton
            icon="mingcute:delete-2-line"
            size="icon"
            variant="secondary"
            :aria-label="t('library.delete')"
            @click="emit('remove', item)"
          />
        </span>
      </li>
    </ul>

    <p
      v-else-if="query"
      class="ep:m-0 ep:py-10 ep:text-center ep:text-sm ep:text-text-muted"
    >
      {{ t('library.noMatch', { query }) }}
    </p>
    <div
      v-else-if="!pending"
      class="ep:py-10 ep:text-center"
    >
      <p class="ep:m-0 ep:text-sm ep:font-medium ep:text-text-strong">
        {{ t('library.empty') }}
      </p>
      <p class="ep:mt-1 ep:mb-0 ep:text-xs ep:text-text-muted">
        {{ t('library.emptyHint') }}
      </p>
    </div>

    <div
      v-if="hasMore"
      class="ep:mt-4 ep:flex ep:justify-center"
    >
      <EPButton
        :loading="pending"
        @click="emit('loadMore')"
      >
        {{ t('library.loadMore') }}
      </EPButton>
    </div>
  </div>
</template>
