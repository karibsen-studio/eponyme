<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed } from 'vue'

interface EponymePageNavigationEntry {
  /** Full entry name, `pages/homepage` or `posts/hello-world`. */
  name: string
  label: string
}

const props = defineProps<{
  basePath: string
  current: string
  entries: EponymePageNavigationEntry[]
}>()

const currentIndex = computed(() => props.entries.findIndex(entry => entry.name === props.current))
const previous = computed(() => currentIndex.value > 0 ? props.entries[currentIndex.value - 1] : undefined)
const next = computed(() => currentIndex.value >= 0 ? props.entries[currentIndex.value + 1] : undefined)

function path(name: string) {
  return `${props.basePath.replace(/\/$/, '')}/${name}`
}
</script>

<template>
  <nav
    v-if="previous || next"
    class="ep:mx-auto ep:grid ep:max-w-3xl ep:grid-cols-1 ep:gap-3 ep:px-6 ep:pb-10 ep:md:grid-cols-2 ep:md:px-10 ep:md:pb-12"
    :aria-label="t('nav.entryPagination')"
  >
    <NuxtLink
      v-if="previous"
      :to="path(previous.name)"
      class="ep:group ep:flex ep:min-w-0 ep:items-center ep:gap-3 ep:rounded-xl ep:bg-nav-card ep:px-5 ep:py-4 ep:text-left ep:no-underline ep:transition ep:hover:bg-nav-card/80"
    >
      <span
        class="ep:text-lg ep:text-text-muted ep:transition ep:group-hover:-translate-x-1 ep:group-hover:text-text-strong"
        aria-hidden="true"
      >←</span>
      <span class="ep:min-w-0">
        <span class="ep:block ep:text-xs ep:font-semibold ep:text-text-muted">{{ t('action.previous') }}</span>
        <span class="ep:mt-1 ep:block ep:truncate ep:text-sm ep:font-semibold ep:text-text-strong">{{ previous.label }}</span>
      </span>
    </NuxtLink>
    <span
      v-else
      class="ep:hidden ep:md:block"
    />
    <NuxtLink
      v-if="next"
      :to="path(next.name)"
      class="ep:group ep:flex ep:min-w-0 ep:items-center ep:justify-end ep:gap-3 ep:rounded-xl ep:bg-nav-card ep:px-5 ep:py-4 ep:text-right ep:no-underline ep:transition ep:hover:bg-nav-card/80"
    >
      <span class="ep:min-w-0">
        <span class="ep:block ep:text-xs ep:font-semibold ep:text-text-muted">{{ t('action.next') }}</span>
        <span class="ep:mt-1 ep:block ep:truncate ep:text-sm ep:font-semibold ep:text-text-strong">{{ next.label }}</span>
      </span>
      <span
        class="ep:text-lg ep:text-text-muted ep:transition ep:group-hover:translate-x-1 ep:group-hover:text-text-strong"
        aria-hidden="true"
      >→</span>
    </NuxtLink>
  </nav>
</template>
