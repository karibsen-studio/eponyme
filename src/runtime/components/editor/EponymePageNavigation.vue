<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  basePath: string
  current: string
  entries: string[]
}>()

const currentIndex = computed(() => props.entries.indexOf(props.current))
const previous = computed(() => currentIndex.value > 0 ? props.entries[currentIndex.value - 1] : undefined)
const next = computed(() => currentIndex.value >= 0 ? props.entries[currentIndex.value + 1] : undefined)

function path(name: string) {
  return `${props.basePath.replace(/\/$/, '')}/${name}`
}

function label(name: string) {
  return (name.split('/').at(-1) ?? name).replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
</script>

<template>
  <nav
    v-if="previous || next"
    class="ep:mx-auto ep:grid ep:max-w-3xl ep:grid-cols-1 ep:gap-3 ep:px-6 ep:pb-10 ep:md:grid-cols-2 ep:md:px-10 ep:md:pb-12"
    aria-label="Entry pagination"
  >
    <NuxtLink
      v-if="previous"
      :to="path(previous)"
      class="ep:group ep:flex ep:min-w-0 ep:items-center ep:gap-3 ep:rounded-xl ep:bg-selected-ep/40 ep:px-5 ep:py-4 ep:text-left ep:no-underline ep:transition ep:hover:border-muted-ep ep:hover:bg-selected-ep"
    >
      <span
        class="ep:text-lg ep:text-muted-ep ep:transition ep:group-hover:-translate-x-1 ep:group-hover:text-white"
        aria-hidden="true"
      >←</span>
      <span class="ep:min-w-0">
        <span class="ep:block ep:text-[10px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">Previous</span>
        <span class="ep:mt-1 ep:block ep:truncate ep:text-sm ep:font-semibold ep:text-white">{{ label(previous) }}</span>
      </span>
    </NuxtLink>
    <span
      v-else
      class="ep:hidden ep:md:block"
    />
    <NuxtLink
      v-if="next"
      :to="path(next)"
      class="ep:group ep:flex ep:min-w-0 ep:items-center ep:justify-end ep:gap-3 ep:rounded-xl ep:bg-selected-ep/40 ep:px-5 ep:py-4 ep:text-right ep:no-underline ep:transition ep:hover:border-muted-ep ep:hover:bg-selected-ep"
    >
      <span class="ep:min-w-0">
        <span class="ep:block ep:text-[10px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">Next</span>
        <span class="ep:mt-1 ep:block ep:truncate ep:text-sm ep:font-semibold ep:text-white">{{ label(next) }}</span>
      </span>
      <span
        class="ep:text-lg ep:text-muted-ep ep:transition ep:group-hover:translate-x-1 ep:group-hover:text-white"
        aria-hidden="true"
      >→</span>
    </NuxtLink>
  </nav>
</template>
