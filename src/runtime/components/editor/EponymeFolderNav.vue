<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { middleEllipsis } from '../../utils/middle-ellipsis'

const props = defineProps<{ basePath: string, eponyme: string }>()
const parts = computed(() => props.eponyme.split('/'))
const folder = computed(() => parts.value.slice(0, -1).join('/'))
const eponymeLabel = computed(() => label(parts.value[parts.value.length - 1] ?? ''))
const breadcrumbs = computed(() => parts.value.slice(0, -1).map((part, index) => ({
  label: label(part),
  path: parts.value.slice(0, index + 1).join('/'),
})))
const hiddenBreadcrumbs = computed(() => breadcrumbs.value.length > 3 ? breadcrumbs.value.slice(1, -1) : [])
const breadcrumbMenuAtBottom = ref(false)
const visibleBreadcrumbs = computed(() => {
  if (!hiddenBreadcrumbs.value.length) return breadcrumbs.value.map(breadcrumb => ({ kind: 'link' as const, ...breadcrumb }))
  return [
    { kind: 'link' as const, ...breadcrumbs.value[0]! },
    { kind: 'collapsed' as const, label: 'Hidden folders', path: '__collapsed__' },
    { kind: 'link' as const, ...breadcrumbs.value.at(-1)! },
  ]
})

function label(name: string) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function updateBreadcrumbMenuScroll(event: Event) {
  const menu = event.currentTarget as HTMLElement | null
  if (!menu) return
  const remainingScroll = menu.scrollHeight - menu.clientHeight - menu.scrollTop
  breadcrumbMenuAtBottom.value = remainingScroll <= 2
}

watch(() => hiddenBreadcrumbs.value.map(breadcrumb => breadcrumb.path).join('|'), () => {
  breadcrumbMenuAtBottom.value = false
})
</script>

<template>
  <nav
    v-if="folder"
    class="ep:relative ep:z-50 ep:flex ep:min-h-14 ep:min-w-0 ep:items-center ep:overflow-visible ep:border-b ep:border-border-ep ep:bg-theme-ep/95 ep:px-3 ep:text-xs ep:backdrop-blur"
    aria-label="Eponyme navigation"
  >
    <div class="eponyme-mobile-breadcrumbs ep:flex ep:min-w-0 ep:flex-1 ep:touch-pan-x ep:items-center ep:overflow-x-auto ep:overscroll-x-contain ep:sm:hidden">
      <template
        v-for="breadcrumb in breadcrumbs"
        :key="breadcrumb.path"
      >
        <NuxtLink
          :to="`${basePath}/${breadcrumb.path}`"
          :title="breadcrumb.label"
          class="ep:max-w-40 ep:shrink-0 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:rounded-md ep:px-2 ep:py-1.5 ep:font-medium ep:text-muted-ep ep:no-underline"
        >
          {{ middleEllipsis(breadcrumb.label) }}
        </NuxtLink>
        <span
          class="ep:mx-1 ep:shrink-0 ep:text-muted-ep"
          aria-hidden="true"
        >/</span>
      </template>
      <span
        :title="eponymeLabel"
        class="ep:shrink-0 ep:whitespace-nowrap ep:px-2 ep:font-medium ep:text-text-ep"
      >{{ middleEllipsis(eponymeLabel, 36) }}</span>
    </div>

    <div class="ep:hidden ep:min-w-0 ep:flex-1 ep:items-center ep:sm:flex">
      <template
        v-for="breadcrumb in visibleBreadcrumbs"
        :key="breadcrumb.path"
      >
        <NuxtLink
          v-if="breadcrumb.kind === 'link'"
          :to="`${basePath}/${breadcrumb.path}`"
          :title="breadcrumb.label"
          class="ep:max-w-40 ep:shrink-0 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:rounded-md ep:px-2 ep:py-1.5 ep:font-medium ep:text-muted-ep ep:no-underline ep:transition ep:hover:bg-selected-ep ep:hover:text-white"
        >
          {{ middleEllipsis(breadcrumb.label) }}
        </NuxtLink>
        <div
          v-else
          class="ep:group ep:relative ep:shrink-0"
        >
          <button
            type="button"
            class="ep:cursor-default ep:rounded-md ep:border-0 ep:bg-transparent ep:px-2 ep:py-1.5 ep:font-semibold ep:text-muted-ep ep:transition ep:hover:bg-selected-ep ep:hover:text-white ep:focus-visible:bg-selected-ep ep:focus-visible:text-white ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-white/20"
            aria-haspopup="menu"
            :aria-label="`${hiddenBreadcrumbs.length} hidden folders`"
          >
            …
          </button>
          <div class="ep:invisible ep:absolute ep:top-full ep:left-0 ep:z-[60] ep:w-max ep:max-w-72 ep:pt-1 ep:opacity-0 ep:transition ep:group-hover:visible ep:group-hover:opacity-100 ep:group-focus-within:visible ep:group-focus-within:opacity-100">
            <div class="ep:relative ep:overflow-hidden ep:rounded-xl ep:border ep:border-border-ep ep:bg-theme-ep ep:p-2">
              <div
                :key="folder"
                role="menu"
                class="eponyme-breadcrumb-menu ep:grid ep:max-h-[212px] ep:gap-1 ep:overflow-y-auto ep:overscroll-contain ep:pr-1"
                @scroll.passive="updateBreadcrumbMenuScroll"
              >
                <NuxtLink
                  v-for="hiddenBreadcrumb in hiddenBreadcrumbs"
                  :key="hiddenBreadcrumb.path"
                  :to="`${basePath}/${hiddenBreadcrumb.path}`"
                  :title="hiddenBreadcrumb.label"
                  role="menuitem"
                  class="ep:block ep:max-w-64 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:rounded-lg ep:px-3 ep:py-2 ep:font-medium ep:text-text-ep ep:no-underline ep:transition ep:hover:bg-selected-ep ep:hover:text-white"
                >
                  {{ hiddenBreadcrumb.label }}
                </NuxtLink>
              </div>
              <Transition name="breadcrumb-scroll-hint">
                <div
                  v-if="hiddenBreadcrumbs.length > 6 && !breadcrumbMenuAtBottom"
                  class="eponyme-breadcrumb-scroll-hint ep:pointer-events-none ep:absolute ep:right-2 ep:bottom-2 ep:left-2 ep:flex ep:h-14 ep:items-end ep:justify-center ep:pb-1 ep:text-center ep:text-[10px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase"
                  aria-hidden="true"
                >
                  Scroll ↓
                </div>
              </Transition>
            </div>
          </div>
        </div>
        <span
          class="ep:mx-1 ep:shrink-0 ep:text-muted-ep"
          aria-hidden="true"
        >/</span>
      </template>
      <span
        :title="eponymeLabel"
        class="ep:min-w-0 ep:overflow-hidden ep:text-ellipsis ep:whitespace-nowrap ep:px-2 ep:font-medium ep:text-text-ep"
      >{{ middleEllipsis(eponymeLabel, 36) }}</span>
    </div>
  </nav>
</template>

<style scoped>
.eponyme-breadcrumb-menu {
  scrollbar-color: rgb(255 255 255 / 35%) transparent;
  scrollbar-width: thin;
}

.eponyme-breadcrumb-menu::-webkit-scrollbar {
  width: 6px;
}

.eponyme-breadcrumb-menu::-webkit-scrollbar-thumb {
  background: rgb(255 255 255 / 35%);
  border-radius: 999px;
}

.eponyme-breadcrumb-scroll-hint {
  background: linear-gradient(180deg, transparent, var(--ep-color-theme-ep, #1c1c1c) 65%);
}

.breadcrumb-scroll-hint-enter-active,
.breadcrumb-scroll-hint-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.breadcrumb-scroll-hint-enter-from,
.breadcrumb-scroll-hint-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .breadcrumb-scroll-hint-enter-active,
  .breadcrumb-scroll-hint-leave-active {
    transition: none;
  }
}
</style>
