<script setup lang="ts">
import { navigateTo, useRequestFetch, useRoute, useState } from '#app'
import { onKeyStroke } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EponymeCollectionEntry, EponymeStatus } from '../../server/services/eponyme-store'
import type { EponymeNavigationNode } from '../../types/eponyme-navigation'
import EponymeNavigationLink from './EponymeNavigationLink.vue'
import EponymeSidebarTree from './EponymeSidebarTree.vue'
import { useEponymeConfig } from '../../composables/useEponymeConfig'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../../utils/get-eponyme-schemas'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import EPAvatar from '../ui/EPAvatar.vue'
import EPButton from '../ui/EPButton.vue'
import EPInputText from '../ui/EPInputText.vue'

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

async function logout() {
  await auth.logout()
  await navigateTo(`${normalizedBasePath.value}/login`)
}

async function restoreNavigationScroll() {
  await nextTick()
  if (navigationElement.value) navigationElement.value.scrollTop = navigationScrollTop.value
}

onMounted(async () => {
  await restoreNavigationScroll()
  const [statusResponse, ...collectionResponses] = await Promise.all([
    requestFetch<{ statuses: Record<string, EponymeStatus> }>('/api/eponyme-statuses'),
    ...Object.keys(collections).map(name => requestFetch<{ entries: EponymeCollectionEntry[] }>(`/api/eponyme-collections/${name}`, { query: { version: 'draft' } })),
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
  // EPInputText's root element is the input itself.
  searchInput.value?.$el?.focus()
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
const navigationTree = computed(() => {
  const root: EponymeNavigationNode[] = []

  function addPath(pathValue: string, finalKind: EponymeNavigationNode['kind'], configuredLabel?: string) {
    const parts = pathValue.split('/')
    let children = root

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!
      const path = parts.slice(0, index + 1).join('/')
      const kind = index === parts.length - 1 ? finalKind : 'folder'
      let node = children.find(item => item.path === path)
      if (!node) {
        node = { kind, path, label: index === parts.length - 1 && configuredLabel ? configuredLabel : label(part), children: [] }
        children.push(node)
      }
      else if (index === parts.length - 1) {
        node.kind = finalKind
        if (configuredLabel) node.label = configuredLabel
      }
      children = node.children
    }
  }

  for (const entry of Object.keys(getEponymeSchemas(config))) addPath(entry, 'entry')
  for (const [name, definition] of Object.entries(collections)) {
    addPath(name, 'collection', definition.label)
    for (const entry of collectionEntries.value[name] ?? []) addPath(`${name}/${entry.slug}`, 'entry', entry.title)
  }
  for (const [name, definition] of Object.entries(forms)) addPath(name, 'form', definition.label)

  return root
})
const openFolders = useState<string[]>(`eponyme:open-folders:${normalizedBasePath.value}`, () => (
  navigation.value.filter(item => item.kind === 'folder').map(item => item.path)
))

function label(name: string) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

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
    class="eponyme-sidebar ep:flex ep:max-h-dvh ep:w-full ep:max-w-full ep:shrink-0 ep:flex-col ep:overflow-hidden ep:border-b ep:border-border-ep ep:bg-theme-ep ep:p-4 ep:transition-[width] ep:md:sticky ep:md:top-0 ep:md:h-dvh ep:md:border-r ep:md:border-b-0 ep:md:p-5"
    :class="{ 'is-collapsed': collapsed }"
  >
    <div class="ep:flex ep:shrink-0 ep:items-center ep:justify-between ep:gap-2">
      <NuxtLink
        v-if="!collapsed"
        :to="normalizedBasePath"
        class="ep:flex ep:min-w-0 ep:items-center ep:gap-2 ep:px-3 ep:text-sm ep:font-bold ep:tracking-tight ep:text-white ep:no-underline"
      >
        Eponyme
      </NuxtLink>
      <button
        type="button"
        class="ep:flex ep:h-8 ep:w-8 ep:shrink-0 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-lg ep:border-0 ep:bg-transparent ep:text-muted-ep ep:transition ep:hover:bg-selected-ep ep:hover:text-white"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
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
      class="ep:mt-6 ep:grid ep:min-h-0 ep:min-w-0 ep:flex-1 ep:content-start ep:gap-1 ep:overflow-y-auto ep:overscroll-contain ep:pr-1"
      aria-label="Content entries"
    >
      <div class="ep:relative ep:mb-3">
        <Icon
          name="mingcute:search-line"
          size="17"
          aria-hidden="true"
          class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:left-3 ep:-translate-y-1/2 ep:text-muted-ep"
        />
        <EPInputText
          ref="searchInput"
          v-model="searchQuery"
          padded
          size="sm"
          type="search"
          placeholder="Search"
          aria-label="Search content entries"
        />
        <kbd class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:right-2.5 ep:-translate-y-1/2 ep:rounded ep:border ep:border-border-ep ep:bg-theme-ep ep:px-1.5 ep:py-0.5 ep:font-sans ep:text-[10px] ep:font-medium ep:text-muted-ep">
          ⌘ K
        </kbd>
      </div>
      <EponymeNavigationLink
        :to="normalizedBasePath"
        label="All entries"
        :active="route.path === normalizedBasePath"
      />
      <EponymeNavigationLink
        v-if="auth.isOwner.value"
        :to="`${normalizedBasePath}/users`"
        label="Users"
        :active="route.path === `${normalizedBasePath}/users`"
      />
      <div
        class="ep:my-3 ep:px-3 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase"
      >
        Editables
      </div>
      <EponymeSidebarTree
        :nodes="navigationTree"
        :base-path="normalizedBasePath"
        :current-path="route.path"
        :statuses="statuses"
        :open-folders="openFolders"
        :can-edit="auth.canEdit.value"
        @update:open-folders="openFolders = $event"
      />
    </nav>
    <div
      v-if="!collapsed && auth.user.value"
      class="ep:mt-5 ep:flex ep:shrink-0 ep:items-center ep:gap-3 ep:border-t ep:border-border-ep ep:px-2 ep:pt-4"
    >
      <EPAvatar
        size="sm"
        :fallback="auth.user.value.username"
      />
      <div class="ep:min-w-0 ep:flex-1">
        <p class="ep:m-0 ep:truncate ep:text-xs ep:font-semibold ep:text-white">
          {{ auth.user.value.username }}
        </p>
        <p class="ep:mt-0.5 ep:mb-0 ep:text-[11px] ep:text-muted-ep ep:capitalize">
          {{ auth.user.value.role }}
        </p>
      </div>
      <EPButton
        variant="ghost"
        icon="mingcute:align-arrow-right-line"
        aria-label="Log out"
        @click="logout"
      />
    </div>
  </aside>
</template>

<style scoped>
@media (min-width: 768px) {
  .eponyme-sidebar {
    width: 350px;
  }

  .eponyme-sidebar.is-collapsed {
    width: 76px;
  }
}
</style>
