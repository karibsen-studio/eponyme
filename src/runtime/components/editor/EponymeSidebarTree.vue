<script setup lang="ts">
import { t } from '#eponyme/locale'
import type { EponymeStatus } from '../../server/services/eponyme-store'
import type { EponymeNavigationNode } from '../../types/eponyme-navigation'
import EPAccordion from '../ui/EPAccordion.vue'
import EponymeNavigationLink from './EponymeNavigationLink.vue'

defineOptions({ name: 'EponymeSidebarTree' })

const props = withDefaults(defineProps<{
  nodes: EponymeNavigationNode[]
  basePath: string
  currentPath: string
  statuses: Record<string, EponymeStatus>
  openFolders: string[]
  /** Reveals every folder while a search is active, without touching `openFolders`. */
  forceOpen?: boolean
  canEdit?: boolean
  depth?: number
}>(), { forceOpen: false, canEdit: false, depth: 0 })

const emit = defineEmits<{ 'update:openFolders': [value: string[]] }>()

function entryPath(path: string) {
  return `${props.basePath}/${path}`
}

function isOpen(path: string) {
  // `openFolders` is the editor's own state: a search must not rewrite it, or clearing
  // the field would leave every folder they had collapsed wide open.
  return props.forceOpen || props.openFolders.includes(path)
}

function setOpen(path: string, open: boolean) {
  const next = new Set(props.openFolders)
  if (open) next.add(path)
  else next.delete(path)
  emit('update:openFolders', [...next])
}
</script>

<template>
  <div class="ep:grid ep:w-full ep:min-w-0 ep:gap-1">
    <template
      v-for="node in nodes"
      :key="`${node.kind}-${node.path}`"
    >
      <EPAccordion
        v-if="node.kind === 'folder' || node.kind === 'collection'"
        :value="node.path"
        :model-value="isOpen(node.path)"
        @update:model-value="setOpen(node.path, $event)"
      >
        <template #header>
          <EponymeNavigationLink
            :to="entryPath(node.path)"
            :label="node.label"
            :depth="depth"
            folder
            :collection="node.kind === 'collection'"
            :active="currentPath === entryPath(node.path)"
          />
        </template>
        <template
          v-if="node.kind === 'collection' && canEdit"
          #action
        >
          <NuxtLink
            :to="{ path: entryPath(node.path), query: { create: '1' } }"
            class="ep:flex ep:h-7 ep:w-7 ep:items-center ep:justify-center ep:rounded-md ep:text-lg ep:font-medium ep:text-text-muted ep:no-underline ep:transition ep:hover:bg-surface-raised ep:hover:text-text-strong ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-contrast/20"
            :aria-label="t('nav.createIn', { folder: node.label })"
            :title="t('nav.createEntry')"
            @click.stop
          >+</NuxtLink>
        </template>
        <EponymeSidebarTree
          :nodes="node.children"
          :base-path="basePath"
          :current-path="currentPath"
          :statuses="statuses"
          :open-folders="openFolders"
          :force-open="forceOpen"
          :can-edit="canEdit"
          :depth="depth + 1"
          @update:open-folders="emit('update:openFolders', $event)"
        />
      </EPAccordion>
      <EponymeNavigationLink
        v-else
        :to="entryPath(node.path)"
        :label="node.label"
        :depth="depth"
        :active="currentPath === entryPath(node.path)"
        :draft="statuses[node.path] === 'draft'"
      />
    </template>
  </div>
</template>
