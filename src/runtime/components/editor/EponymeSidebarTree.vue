<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, onMounted, ref, watch } from 'vue'
import type { EponymeStatus } from '../../server/services/eponyme-store'
import type { EponymeNavigationRow } from '../../utils/flatten-navigation-tree'
import EponymeNavigationLink from './EponymeNavigationLink.vue'

/** A row is one link: its height only changes with the theme, so one estimate fits all. */
const ROW_HEIGHT = 36

const props = defineProps<{
  rows: EponymeNavigationRow[]
  basePath: string
  currentPath: string
  statuses: Record<string, EponymeStatus>
  /** The sidebar's scrolling element, which holds the search field above this list. */
  scrollElement?: HTMLElement
  canCreate?: (collection: string) => boolean
}>()

const emit = defineEmits<{ toggle: [path: string], loadMore: [collection: string] }>()

const listElement = ref<HTMLElement>()
/** Virtualising needs a scrolling element, which only exists in a browser. */
const virtualized = ref(false)
onMounted(() => virtualized.value = true)

/**
 * The search field and the fixed links sit above this list inside the same scrolling element, so the
 * virtualiser is told how far down the list starts.
 */
const scrollMargin = computed(() => {
  if (!listElement.value || !props.scrollElement) return 0
  return listElement.value.offsetTop - props.scrollElement.offsetTop
})

const virtualizer = useVirtualizer(computed(() => ({
  count: props.rows.length,
  getScrollElement: () => props.scrollElement ?? null,
  estimateSize: () => ROW_HEIGHT,
  getItemKey: (index: number) => props.rows[index]?.key ?? index,
  scrollMargin: scrollMargin.value,
  overscan: 8,
})))

interface RenderedRow {
  key: string
  index: number
  row: EponymeNavigationRow
  /** Where the row sits in the virtual list, `undefined` while rendering plainly. */
  offset?: number
}

const renderedRows = computed<RenderedRow[]>(() => {
  if (!virtualized.value) return props.rows.map((row, index) => ({ key: row.key, index, row }))
  return virtualizer.value.getVirtualItems().flatMap((item) => {
    const row = props.rows[item.index]
    return row ? [{ key: String(item.key), index: item.index, row, offset: item.start - scrollMargin.value }] : []
  })
})

const height = computed(() => virtualized.value ? `${virtualizer.value.getTotalSize()}px` : undefined)

function entryPath(path: string) {
  return `${props.basePath}/${path}`
}

// Rendering the trailing row of a collection means its last loaded entry is on screen, which is exactly
// when the next page is worth fetching.
watch(renderedRows, (rows) => {
  if (!virtualized.value) return
  for (const { row } of rows) {
    if (row.kind === 'more') emit('loadMore', row.path)
  }
})
</script>

<template>
  <div
    ref="listElement"
    class="ep:relative ep:grid ep:w-full ep:min-w-0 ep:content-start ep:gap-1"
    :style="{ height }"
  >
    <div
      v-for="{ key, index, row, offset } in renderedRows"
      :key="key"
      :ref="virtualized ? virtualizer.measureElement : undefined"
      :data-index="index"
      class="ep:w-full ep:min-w-0"
      :class="virtualized ? 'ep:absolute ep:top-0 ep:left-0' : ''"
      :style="offset === undefined ? undefined : { transform: `translateY(${offset}px)` }"
    >
      <p
        v-if="row.kind === 'more'"
        class="ep:m-0 ep:py-2 ep:text-xs ep:text-text-muted"
        :style="{ paddingLeft: `${12 + row.depth * 14}px` }"
      >
        {{ t('sidebar.loadingMore') }}
      </p>
      <div
        v-else
        class="ep:group ep:relative ep:w-full ep:min-w-0"
      >
        <EponymeNavigationLink
          :to="entryPath(row.path)"
          :label="row.label"
          :depth="row.depth"
          :folder="row.open !== undefined"
          :collection="row.kind === 'collection'"
          :active="currentPath === entryPath(row.path)"
          :draft="statuses[row.path] === 'draft'"
        />
        <NuxtLink
          v-if="row.kind === 'collection' && canCreate?.(row.path)"
          :to="{ path: entryPath(row.path), query: { create: '1' } }"
          class="ep:absolute ep:top-1/2 ep:right-9 ep:flex ep:h-7 ep:w-7 ep:-translate-y-1/2 ep:items-center ep:justify-center ep:rounded-md ep:text-lg ep:font-medium ep:text-text-muted ep:no-underline ep:opacity-0 ep:transition ep:group-hover:opacity-100 ep:hover:bg-surface-raised ep:hover:text-text-strong ep:focus-visible:opacity-100"
          :aria-label="t('nav.createIn', { folder: row.label })"
          :title="t('nav.createEntry')"
          @click.stop
        >+</NuxtLink>
        <button
          v-if="row.open !== undefined"
          type="button"
          class="ep:absolute ep:top-1/2 ep:right-1.5 ep:flex ep:h-7 ep:w-7 ep:-translate-y-1/2 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-md ep:border-0 ep:bg-transparent ep:text-text-muted ep:transition ep:hover:bg-surface-raised ep:hover:text-text-strong ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-contrast/20"
          :aria-expanded="row.open"
          :aria-label="row.open ? t('accordion.close') : t('accordion.open')"
          @click="emit('toggle', row.path)"
        >
          <Icon
            name="mingcute:down-small-line"
            size="18"
            aria-hidden="true"
            class="ep:transition-transform"
            :class="{ 'ep:-rotate-90': !row.open }"
          />
        </button>
      </div>
    </div>
  </div>
</template>
