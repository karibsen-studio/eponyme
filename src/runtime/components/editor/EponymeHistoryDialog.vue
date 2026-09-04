<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useRequestFetch } from '#app'
import { ref, watch } from 'vue'
import EPBadge from '../ui/EPBadge.vue'
import EPAlertDialog from '../ui/EPAlertDialog.vue'
import EPButton from '../ui/EPButton.vue'
import EPDialog from '../ui/EPDialog.vue'
import type { EponymeHistoryEntry } from '../../server/services/eponyme-store'
import { formatVersionDate, useEponymeHistory } from '../../composables/useEponymeHistory'
import { getEponymeErrorMessage } from '../../utils/eponyme-error'
import { EPONYME_REVISION_HEADER } from '../../utils/eponyme-revision'

const props = withDefaults(
  // `revision` is the version the editor is looking at: restoring replaces the whole entry, so it is
  // refused when someone else has saved since.
  defineProps<{ open: boolean, name: string, revision: string | null, canRestore?: boolean }>(),
  { canRestore: false },
)
const emit = defineEmits<{ 'update:open': [value: boolean], 'restored': [] }>()
const requestFetch = useRequestFetch()
const { history, pending, error, load } = useEponymeHistory(() => props.name)
const restoreTarget = ref<EponymeHistoryEntry>()
const restorePending = ref(false)
const restoreError = ref('')

function requestRestore(version: EponymeHistoryEntry) {
  restoreTarget.value = version
  restoreError.value = ''
}

function setRestoreOpen(open: boolean) {
  if (open || restorePending.value) return
  restoreTarget.value = undefined
  restoreError.value = ''
}

async function restore() {
  const version = restoreTarget.value
  if (!version || restorePending.value) return
  restorePending.value = true
  restoreError.value = ''
  try {
    await requestFetch(`/api/eponyme-history/${props.name}/${version.id}`, {
      method: 'PATCH',
      headers: props.revision ? { [EPONYME_REVISION_HEADER]: props.revision } : undefined,
    })
    emit('restored')
    restoreTarget.value = undefined
    emit('update:open', false)
  }
  catch (caught) {
    restoreError.value = getEponymeErrorMessage(caught, t('history.restoreFailed'))
  }
  finally {
    restorePending.value = false
  }
}

watch(() => props.open, open => open && void load())
</script>

<template>
  <EPDialog
    :open="open"
    :title="t('history.title')"
    :description="t('history.description')"
    @update:open="emit('update:open', $event)"
  >
    <p
      v-if="pending"
      class="ep:text-sm ep:text-text-muted"
    >
      {{ t('history.loading') }}
    </p>
    <p
      v-else-if="error"
      class="ep:text-sm ep:text-danger"
    >
      {{ error }}
    </p>
    <p
      v-else-if="!history.length"
      class="ep:text-sm ep:text-text-muted"
    >
      {{ t('history.empty') }}
    </p>
    <ol
      v-else
      class="ep:m-0 ep:grid ep:max-h-[55vh] ep:list-none ep:gap-2 ep:overflow-y-auto ep:p-0"
    >
      <li
        v-for="version in history"
        :key="version.id"
        class="ep:flex ep:items-center ep:justify-between ep:gap-4 ep:rounded-xl ep:bg-surface-active/40 ep:p-3"
      >
        <div class="ep:min-w-0">
          <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
            <EPBadge :variant="version.status === 'published' ? 'success' : version.status === 'draft' ? 'warning' : 'neutral'">
              {{ t(`history.action.${version.action}`) }}
            </EPBadge>
            <span class="ep:text-sm ep:font-medium ep:text-text-strong">{{ formatVersionDate(version.createdAt) }}</span>
          </div>
          <p class="ep:mt-1 ep:mb-0 ep:text-xs ep:text-text-muted">
            {{ t('history.version', { id: version.id }) }}
            <template v-if="version.user">
              {{ t('history.by', { user: version.user.username }) }}
            </template>
            <template v-else>
              {{ t('history.unknownAuthor') }}
            </template>
          </p>
        </div>
        <EPButton
          v-if="canRestore"
          size="sm"
          @click="requestRestore(version)"
        >
          {{ t('action.restore') }}
        </EPButton>
      </li>
    </ol>

    <EPAlertDialog
      :open="Boolean(restoreTarget)"
      :label="t('history.restoreTitle')"
      :description="restoreTarget ? t('history.restoreDescription', { date: formatVersionDate(restoreTarget.createdAt) }) : ''"
      :confirm-label="t('history.restoreAction')"
      confirm-variant="primary"
      :confirm-loading="restorePending"
      :close-on-confirm="false"
      @update:open="setRestoreOpen"
      @confirm="restore"
    >
      <p
        v-show="restoreError"
        role="alert"
        class="ep:m-0 ep:rounded-lg ep:bg-danger/10 ep:p-3 ep:text-sm ep:text-danger"
      >
        {{ restoreError }}
      </p>
    </EPAlertDialog>
  </EPDialog>
</template>
