<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed } from 'vue'
import EPButton from '../ui/EPButton.vue'

const props = withDefaults(defineProps<{
  to: string
  label: string
  variant?: 'sidebar' | 'breadcrumb' | 'card'
  active?: boolean
  depth?: number
  folder?: boolean
  description?: string
  draft?: boolean
  collection?: boolean
}>(), {
  variant: 'sidebar',
  active: false,
  depth: 0,
  folder: false,
  description: undefined,
  draft: false,
  collection: false,
})

const sidebarLabel = computed(() => {
  const maxLength = Math.max(18, 30 - props.depth * 3)
  const characters = [...props.label]
  if (characters.length <= maxLength) return props.label
  return `${characters.slice(0, maxLength - 1).join('')}…`
})
</script>

<template>
  <div
    v-if="variant === 'sidebar'"
    class="ep:relative ep:w-full ep:min-w-0"
  >
    <NuxtLink
      :to="to"
      :aria-current="active ? 'page' : undefined"
      class="eponyme-sidebar-link ep:flex ep:w-full ep:max-w-full ep:min-w-0 ep:items-center ep:rounded-lg ep:py-2 ep:text-sm ep:no-underline"
      :title="label"
      :class="[
        folder ? collection ? 'ep:pr-20 ep:font-medium' : 'ep:pr-10 ep:font-medium' : 'ep:pr-3',
        active
          ? 'ep:bg-nav-active ep:text-text-strong ep:hover:bg-nav-active'
          : folder
            ? 'ep:text-text-default ep:hover:bg-nav-hover/50 ep:hover:text-text-strong'
            : 'ep:text-text-muted ep:hover:bg-nav-hover/50 ep:hover:text-text-strong',
      ]"
      :style="{ paddingLeft: `${12 + depth * 14}px` }"
    >
      <span class="ep:flex ep:w-full ep:min-w-0 ep:items-center ep:gap-2 ep:overflow-hidden">
        <span class="ep:block ep:min-w-0 ep:flex-1 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap">{{ sidebarLabel }}</span>
        <span
          v-if="draft"
          class="ep:h-1.5 ep:w-1.5 ep:shrink-0 ep:rounded-full ep:bg-text-badge-warning"
          :title="t('entry.draft')"
          :aria-label="t('entry.draft')"
        />
      </span>
    </NuxtLink>
  </div>

  <NuxtLink
    v-else-if="variant === 'breadcrumb'"
    :to="to"
    class="ep:rounded-md ep:px-2 ep:py-1.5 ep:font-medium ep:text-text-muted ep:no-underline ep:transition ep:hover:bg-nav-hover ep:hover:text-text-strong"
  >{{ label }}</NuxtLink>

  <NuxtLink
    v-else
    :to="to"
    :title="label"
    class="ep:group ep:flex ep:min-h-4 ep:min-w-0 ep:items-center ep:justify-between ep:rounded-xl ep:bg-nav-card ep:px-5 ep:py-4 ep:font-semibold ep:text-text-default ep:no-underline ep:transition ep:hover:bg-nav-card/80"
  >
    <span class="ep:min-w-0 ep:flex-1">
      <span class="ep:block ep:truncate ep:text-sm ep:text-text-strong">{{ label }}</span>
      <span
        v-if="description"
        class="ep:mt-1 ep:block ep:text-xs ep:font-medium ep:text-text-muted"
      >{{ description }}</span>
    </span>
    <EPButton
      class="ep:group-hover:translate-x-1 ep:hover:bg-transparent ep:group-hover:text-text-strong"
      variant="ghost"
      icon="mingcute:arrow-right-line"
    />
  </NuxtLink>
</template>

<style scoped>
.eponyme-sidebar-link {
  transition: color 200ms ease-out, background-color 200ms ease-out;
}
</style>
