<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EPButton from '../ui/EPButton.vue'
import EPSelect from '../ui/EPSelect.vue'
import { formatVersionDate, useEponymeHistory } from '../../composables/useEponymeHistory'
import { EPONYME_PREVIEW_QUERY, EPONYME_PREVIEW_TOKEN_QUERY, EPONYME_PREVIEW_VERSION_QUERY } from '../../utils/preview'

const props = defineProps<{
  name: string
  /** Public route of the site rendering this entry, from `eponyme.previewPaths`. */
  path: string
  open: boolean
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { history, load } = useEponymeHistory(() => props.name)
const selected = ref('draft')

/** Unique per request, so no two preview loads ever share a URL. */
function newToken() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Changing this remounts the iframe, which is the only reliable way to reload a
// cross-document frame we do not control.
const previewToken = ref(newToken())

const options = computed(() => [
  { label: 'Draft (last saved)', value: 'draft' },
  { label: 'Published', value: 'published' },
  ...history.value.map(version => ({
    label: `${formatVersionDate(version.createdAt)} · ${version.action}${version.user ? ` · ${version.user.username}` : ''}`,
    value: String(version.id),
  })),
])

const previewUrl = computed(() => {
  const url = new URL(props.path, 'http://placeholder')
  url.searchParams.set(EPONYME_PREVIEW_QUERY, props.name)
  url.searchParams.set(EPONYME_PREVIEW_VERSION_QUERY, selected.value)
  // Cache-buster: the same URL would otherwise be served from the frame's history.
  url.searchParams.set(EPONYME_PREVIEW_TOKEN_QUERY, previewToken.value)
  return `${url.pathname}${url.search}`
})

async function reload() {
  previewToken.value = newToken()
  await load()
  if (selected.value !== 'draft' && selected.value !== 'published' && !history.value.some(version => String(version.id) === selected.value))
    selected.value = 'draft'
}

// Switching versions must repaint immediately; without a fresh token, going
// draft -> published -> draft would rebuild the exact same URL.
watch(selected, () => {
  previewToken.value = newToken()
})

function openInNewTab() {
  window.open(previewUrl.value, '_blank', 'noopener,noreferrer')
}

defineExpose({ reload })

watch(() => props.open, (open) => {
  if (open) void load()
})

watch(() => props.name, () => {
  selected.value = 'draft'
  previewToken.value = newToken()
})
</script>

<template>
  <aside
    v-if="open"
    class="ep:fixed ep:z-100 ep:top-0 ep:right-0 ep:bottom-0 ep:flex ep:w-full ep:flex-col ep:border-l ep:border-border-ep ep:bg-theme-ep ep:shadow-2xl ep:md:w-[45vw] ep:lg:w-[40vw]"
    aria-label="Preview"
  >
    <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2 ep:border-b ep:border-border-ep ep:p-3">
      <EPSelect
        size="sm"
        class="ep:min-w-0 ep:flex-1"
        :model-value="selected"
        :options="options"
        content-class="ep:z-110"
        aria-label="Version to preview"
        @update:model-value="selected = $event"
      />
      <EPButton
        icon="mingcute:refresh-2-line"
        variant="ghost"
        aria-label="Reload preview"
        @click="reload"
      />
      <EPButton
        icon="mingcute:external-link-line"
        variant="ghost"
        aria-label="Open preview in a new tab"
        @click="openInNewTab"
      />
      <EPButton
        icon="mingcute:close-line"
        variant="ghost"
        aria-label="Close preview"
        @click="emit('update:open', false)"
      />
    </div>
    <p class="ep:m-0 ep:px-3 ep:py-2 ep:text-[11px] ep:text-muted-ep">
      Shows saved content — unsaved edits appear after you save.
    </p>
    <iframe
      :key="previewUrl"
      :src="previewUrl"
      title="Entry preview"
      class="ep:min-h-0 ep:w-full ep:flex-1 ep:border-0 ep:bg-white"
    />
  </aside>
</template>
