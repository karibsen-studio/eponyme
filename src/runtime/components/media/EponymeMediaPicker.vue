<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed, ref, watch } from 'vue'
import EPButton from '../ui/EPButton.vue'
import EPDialog from '../ui/EPDialog.vue'
import EPInputText from '../ui/EPInputText.vue'
import EponymeMediaGrid from './EponymeMediaGrid.vue'
import EponymeMediaUploader from './EponymeMediaUploader.vue'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import { useEponymeMedia } from '../../composables/useEponymeMedia'
import type { EponymeMediaItem } from '../../types/storage'

const props = withDefaults(defineProps<{
  open: boolean
  selected?: string
  accept?: string[]
  maxSize?: number
}>(), { accept: () => [] })

const emit = defineEmits<{
  'update:open': [value: boolean]
  'select': [item: EponymeMediaItem]
}>()

const auth = useEponymeAuth()
const canUpload = computed(() => auth.can('media.upload', { kind: 'system', name: 'media' }))
const { items, pending, error, hasMore, refresh, loadMore, upload } = useEponymeMedia()
const query = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  query.value = ''
  if (!items.value.length) void refresh()
})

function choose(item: EponymeMediaItem) {
  emit('select', item)
  emit('update:open', false)
}
</script>

<template>
  <EPDialog
    :open="open"
    size="lg"
    :title="t('library.pick')"
    :description="t('library.description')"
    @update:open="emit('update:open', $event)"
  >
    <div class="ep:grid ep:gap-4">
      <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
        <EPInputText
          v-model="query"
          type="search"
          size="sm"
          class="ep:min-w-40 ep:flex-1"
          :placeholder="t('library.search')"
          :aria-label="t('library.search')"
        />
        <EponymeMediaUploader
          v-if="canUpload"
          :accept="accept"
          :max-size="maxSize"
          :upload="upload"
          @uploaded="choose"
        />
      </div>

      <p
        v-if="error"
        role="alert"
        class="ep:m-0 ep:text-xs ep:text-danger"
      >
        {{ error }}
      </p>

      <div class="ep:max-h-[60vh] ep:overflow-y-auto ep:scrollbar-thin ep:pr-1">
        <EponymeMediaGrid
          :items="items"
          :pending="pending"
          :query="query"
          :selected="selected"
          :accept="accept"
          :has-more="hasMore"
          @select="choose"
          @load-more="loadMore"
        />
      </div>

      <div class="ep:flex ep:justify-end">
        <EPButton
          variant="ghost"
          @click="emit('update:open', false)"
        >
          {{ t('action.cancel') }}
        </EPButton>
      </div>
    </div>
  </EPDialog>
</template>
