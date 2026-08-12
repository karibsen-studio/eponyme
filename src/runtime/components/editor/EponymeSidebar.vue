<script setup lang="ts">
import { t } from '#eponyme/locale'
import { navigateTo, useRequestFetch, useRoute, useState } from '#app'
import { onKeyStroke, useMediaQuery } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EponymeCollectionEntry, EponymeStatus } from '../../server/services/eponyme-store'
import EponymeNavigationLink from './EponymeNavigationLink.vue'
import EponymeSidebarTree from './EponymeSidebarTree.vue'
import { useEponymeConfig } from '../../composables/useEponymeConfig'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../../utils/get-eponyme-schemas'
import { buildEponymeNavigationTree } from '../../utils/build-navigation-tree'
import { filterEponymeNavigationTree, preloadEponymeNavigationSearch } from '../../utils/filter-navigation-tree'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import EPAvatar from '../ui/EPAvatar.vue'
import EPDropdownMenu from '../ui/EPDropdownMenu.vue'
import EPInputText from '../ui/EPInputText.vue'
import logoUrl from '../../assets/logo.png?url'
import { useEponymeTheme } from '../../composables/useEponymeTheme'

const props = defineProps<{ basePath: string }>()
const route = useRoute()
const config = useEponymeConfig()
const collapsed = useState<boolean>('eponyme:sidebar-collapsed', () => false)
const statuses = useState<Record<string, EponymeStatus>>('eponyme:entry-statuses', () => ({}))
const requestFetch = useRequestFetch()
const searchInput = ref<{ $el?: HTMLInputElement }>()
const searchQuery = ref('')
const collectionEntries = useState<Record<string, EponymeCollectionEntry[]>>('eponyme:collection-entries', () => ({}))
const collections = getEponymeCollections(config)
const forms = getEponymeForms(config)
const normalizedBasePath = computed(() => props.basePath.replace(/\/$/, ''))
const navigationElement = ref<HTMLElement>()
const navigationScrollTop = useState<number>(`eponyme:sidebar-scroll:${normalizedBasePath.value}`, () => 0)
const auth = useEponymeAuth()
const isMobile = useMediaQuery('(max-width: 767px)')
const { setTheme } = useEponymeTheme()
const profileItems = computed(() => [
  { label: t('sidebar.lightTheme'), value: 'theme-light', icon: 'mingcute:sun-line' },
  { label: t('sidebar.darkTheme'), value: 'theme-dark', icon: 'mingcute:moon-line' },
  { label: t('sidebar.logout'), value: 'logout', icon: 'mingcute:exit-line', danger: true },
])

function closeOnMobileNavigation(event: MouseEvent) {
  if (!isMobile.value || !(event.target instanceof Element) || !event.target.closest('a')) return
  collapsed.value = true
}

async function logout() {
  await auth.logout()
  await navigateTo(`${normalizedBasePath.value}/login`)
}

async function handleProfileAction(value: string) {
  if (value === 'theme-light') return setTheme('light')
  if (value === 'theme-dark') return setTheme('dark')
  if (value === 'logout') await logout()
}

async function restoreNavigationScroll() {
  await nextTick()
  if (navigationElement.value) navigationElement.value.scrollTop = navigationScrollTop.value
}

onMounted(async () => {
  await restoreNavigationScroll()
  const [statusResponse, ...collectionResponses] = await Promise.all([
    requestFetch<{ statuses: Record<string, EponymeStatus> }>('/api/eponyme-statuses'),
    ...Object.keys(collections).map(name => requestFetch<{ entries: EponymeCollectionEntry[] }>(`/api/eponyme-collections/${name}`, { query: { version: 'draft', raw: 1 } })),
  ])
  statuses.value = { ...statusResponse.statuses }
  collectionEntries.value = Object.fromEntries(Object.keys(collections).map((name, index) => [name, collectionResponses[index]?.entries ?? []]))
  for (const [name, entries] of Object.entries(collectionEntries.value)) {
    for (const entry of entries) statuses.value[`${name}/${entry.slug}`] = entry.status
  }
  await restoreNavigationScroll()
})

onBeforeUnmount(() => {
  if (navigationElement.value) navigationScrollTop.value = navigationElement.value.scrollTop
})

onKeyStroke('k', (event) => {
  if (!event.metaKey && !event.ctrlKey) return
  event.preventDefault()
  searchInput.value?.$el?.focus()
  searchInput.value?.$el?.select()
})

onKeyStroke('Escape', () => {
  if (!isFiltering.value) return
  searchQuery.value = ''
  searchInput.value?.$el?.blur()
})

const navigation = computed(() => {
  const items: Array<{ kind: 'folder' | 'entry', path: string }> = []

  for (const entry of Object.keys(getEponymeSchemas(config))) {
    const parts = entry.split('/')
    for (let depth = 0; depth < parts.length - 1; depth++) {
      const path = parts.slice(0, depth + 1).join('/')
      if (items.some(item => item.kind === 'folder' && item.path === path)) continue
      items.push({ kind: 'folder', path })
    }
    items.push({ kind: 'entry', path: entry })
  }
  for (const collection of Object.keys(collections)) {
    const parts = collection.split('/')
    for (let depth = 0; depth < parts.length; depth++) {
      const path = parts.slice(0, depth + 1).join('/')
      if (items.some(item => item.kind === 'folder' && item.path === path)) continue
      items.push({ kind: 'folder', path })
    }
  }
  for (const formName of Object.keys(forms)) {
    const parts = formName.split('/')
    for (let depth = 0; depth < parts.length - 1; depth++) {
      const path = parts.slice(0, depth + 1).join('/')
      if (items.some(item => item.kind === 'folder' && item.path === path)) continue
      items.push({ kind: 'folder', path })
    }
    items.push({ kind: 'entry', path: formName })
  }

  return items
})
const navigationTree = computed(() => buildEponymeNavigationTree({
  schemas: getEponymeSchemas(config),
  collections,
  forms,
  collectionEntries: collectionEntries.value,
}))
const isFiltering = computed(() => searchQuery.value.trim().length > 0)
const filteredTree = computed(() => filterEponymeNavigationTree(navigationTree.value, searchQuery.value))
const openFolders = useState<string[]>(`eponyme:open-folders:${normalizedBasePath.value}`, () => (
  navigation.value.filter(item => item.kind === 'folder').map(item => item.path)
))

function entryPath(name: string) {
  return `${normalizedBasePath.value}/${name}`
}

function isRouteInsideFolder(path: string) {
  const target = entryPath(path)
  return route.path === target || route.path.startsWith(`${target}/`)
}

watch(() => route.path, () => {
  const next = new Set(openFolders.value)
  for (const item of navigation.value) {
    if (item.kind === 'folder' && isRouteInsideFolder(item.path)) next.add(item.path)
  }
  openFolders.value = [...next]
})
</script>

<template>
  <aside
    class="eponyme-sidebar ep:flex ep:max-h-dvh ep:w-full ep:max-w-full ep:shrink-0 ep:flex-col ep:overflow-hidden ep:border-b ep:border-border-default ep:bg-surface-sidebar ep:p-4 ep:transition-[width] ep:md:sticky ep:md:top-0 ep:md:h-dvh ep:md:border-r ep:md:border-b-0 ep:md:p-5"
    :class="{ 'is-collapsed': collapsed }"
    @click="closeOnMobileNavigation"
  >
    <div class="ep:flex ep:shrink-0 ep:items-center ep:justify-between ep:gap-2">
      <NuxtLink
        v-if="!collapsed"
        :to="normalizedBasePath"
        class="ep:flex ep:min-w-0 ep:items-center ep:no-underline"
      >
        <img
          :src="logoUrl"
          :alt="t('sidebar.logo')"
          class="ep:block ep:size-8"
        >
      </NuxtLink>
      <button
        type="button"
        class="ep:flex ep:h-8 ep:w-8 ep:shrink-0 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-lg ep:border-0 ep:bg-transparent ep:text-text-muted ep:transition ep:hover:bg-surface-active ep:hover:text-text-strong"
        :aria-label="collapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        :title="collapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        @click="collapsed = !collapsed"
      >
        <Icon
          :name="collapsed ? 'mingcute:layout-leftbar-open-line' : 'mingcute:layout-leftbar-close-line'"
          size="18"
          aria-hidden="true"
        />
      </button>
    </div>
    <nav
      v-if="!collapsed"
      ref="navigationElement"
      class="ep:mt-6 ep:grid ep:min-h-0 ep:min-w-0 ep:flex-1 ep:content-start ep:gap-1 ep:overflow-y-auto ep:scrollbar-thin ep:overscroll-contain ep:pr-1"
      :aria-label="t('sidebar.contentEntries')"
    >
      <div class="ep:relative ep:mb-3">
        <Icon
          name="mingcute:search-line"
          size="17"
          aria-hidden="true"
          class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:left-3 ep:-translate-y-1/2 ep:text-text-muted"
        />
        <EPInputText
          ref="searchInput"
          v-model="searchQuery"
          padded
          size="sm"
          type="search"
          :placeholder="t('sidebar.search')"
          :aria-label="t('sidebar.searchLabel')"
          @focus="preloadEponymeNavigationSearch"
        />
        <kbd class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:right-2.5 ep:-translate-y-1/2 ep:rounded ep:border ep:border-border-default ep:bg-surface-raised ep:px-1.5 ep:py-0.5 ep:font-sans ep:text-[10px] ep:font-medium ep:text-text-muted">
          ⌘ K
        </kbd>
      </div>
      <EponymeNavigationLink
        :to="normalizedBasePath"
        :label="t('sidebar.allEntries')"
        :active="route.path === normalizedBasePath"
      />
      <EponymeNavigationLink
        v-if="auth.isOwner.value"
        :to="`${normalizedBasePath}/users`"
        :label="t('sidebar.users')"
        :active="route.path === `${normalizedBasePath}/users`"
      />
      <div class="ep:mx-2 ep:h-px ep:bg-border-default ep:my-1.5" />
      <EponymeSidebarTree
        :nodes="filteredTree"
        :base-path="normalizedBasePath"
        :current-path="route.path"
        :statuses="statuses"
        :open-folders="openFolders"
        :force-open="isFiltering"
        :can-edit="auth.canEdit.value"
        @update:open-folders="openFolders = $event"
      />
      <p
        v-if="isFiltering && !filteredTree.length"
        class="ep:m-0 ep:px-3 ep:py-2 ep:text-xs ep:text-text-muted"
      >
        {{ t('sidebar.noMatch', { query: searchQuery }) }}
      </p>
    </nav>
    <EPDropdownMenu
      v-if="!collapsed && auth.user.value"
      :items="profileItems"
      content-class="ep:z-100"
      @select="handleProfileAction"
    >
      <template #trigger>
        <button
          type="button"
          class="ep:mt-5 ep:flex ep:w-full ep:shrink-0 ep:border ep:border-border-default ep:cursor-pointer ep:items-center ep:gap-3 ep:bg-transparent ep:px-2 ep:py-2 ep:rounded-lg ep:text-left ep:outline-none ep:transition ep:hover:bg-surface-active ep:focus-visible:ring-2 ep:focus-visible:ring-contrast/30"
          :aria-label="t('sidebar.profileMenu', { username: auth.user.value.username })"
        >
          <EPAvatar
            size="sm"
            :username="auth.user.value.username"
          />
          <span class="ep:min-w-0 ep:flex-1">
            <span class="ep:block ep:truncate ep:text-xs ep:font-semibold ep:text-text-strong">
              {{ auth.user.value.username }}
            </span>
            <span class="ep:block ep:text-[11px] ep:text-text-muted">
              {{ t(`role.${auth.user.value.role}`) }}
            </span>
          </span>
          <Icon
            name="mingcute:selector-vertical-line"
            size="20"
            class="ep:shrink-0 ep:text-text-muted"
            aria-hidden="true"
          />
        </button>
      </template>
    </EPDropdownMenu>
  </aside>
</template>

<style scoped>
@media (max-width: 767px) {
  .eponyme-sidebar:not(.is-collapsed) {
    position: fixed;
    inset: 0;
    z-index: 90;
    height: 100dvh;
    max-height: 100dvh;
    border-bottom: 0;
  }
}

@media (min-width: 768px) {
  .eponyme-sidebar {
    width: 350px;
  }

  .eponyme-sidebar.is-collapsed {
    width: 76px;
  }
}
</style>
