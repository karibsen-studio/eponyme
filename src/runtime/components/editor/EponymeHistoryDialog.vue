<script setup lang="ts">
import { useRequestFetch } from '#app'
import { ref, watch } from 'vue'
import EPBadge from '../ui/EPBadge.vue'
import EPButton from '../ui/EPButton.vue'
import EPDialog from '../ui/EPDialog.vue'
import type { EponymeHistoryEntry } from '../../server/services/eponyme-store'
import { formatVersionDate, useEponymeHistory } from '../../composables/useEponymeHistory'

const props = withDefaults(defineProps<{ open: boolean, name: string, canRestore?: boolean }>(), { canRestore: false })
const emit = defineEmits<{ 'update:open': [value: boolean], 'restored': [] }>()
const requestFetch = useRequestFetch()
const { history, pending, error, load } = useEponymeHistory(() => props.name)
const restoring = ref<number>()

async function restore(version: EponymeHistoryEntry) {
  if (!confirm(`Restore the version from ${formatVersionDate(version.createdAt)}?`)) return
  restoring.value = version.id
  error.value = ''
  try {
    await requestFetch(`/api/eponyme-history/${props.name}/${version.id}`, { method: 'PATCH' })
    emit('restored')
    emit('update:open', false)
  }
  catch {
    error.value = 'Unable to restore this version.'
  }
  finally {
    restoring.value = undefined
  }
}

watch(() => props.open, open => open && void load())
</script>

<template>
  <EPDialog
    :open="open"
    title="Version history"
    description="Restore an earlier draft or published version of this entry."
    @update:open="emit('update:open', $event)"
  >
    <p
      v-if="pending"
      class="ep:text-sm ep:text-muted-ep"
    >
      Loading versions…
    </p>
    <p
      v-else-if="error"
      class="ep:text-sm ep:text-danger-ep"
    >
      {{ error }}
    </p>
    <p
      v-else-if="!history.length"
      class="ep:text-sm ep:text-muted-ep"
    >
      No saved versions yet.
    </p>
    <ol
      v-else
      class="ep:m-0 ep:grid ep:max-h-[55vh] ep:list-none ep:gap-2 ep:overflow-y-auto ep:p-0"
    >
      <li
        v-for="version in history"
        :key="version.id"
        class="ep:flex ep:items-center ep:justify-between ep:gap-4 ep:rounded-xl ep:bg-selected-ep/40 ep:p-3"
      >
        <div class="ep:min-w-0">
          <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
            <EPBadge :variant="version.status === 'published' ? 'success' : 'warning'">
              {{ version.action }}
            </EPBadge>
            <span class="ep:text-sm ep:font-medium ep:text-white">{{ formatVersionDate(version.createdAt) }}</span>
          </div>
          <p class="ep:mt-1 ep:mb-0 ep:text-xs ep:text-muted-ep">
            Version #{{ version.id }} ·
            <template v-if="version.user">
              by {{ version.user.username }}
            </template>
            <template v-else>
              author unknown
            </template>
          </p>
        </div>
        <EPButton
          v-if="canRestore"
          size="sm"
          :loading="restoring === version.id"
          :disabled="restoring !== undefined"
          @click="restore(version)"
        >
          Restore
        </EPButton>
      </li>
    </ol>
  </EPDialog>
</template>
