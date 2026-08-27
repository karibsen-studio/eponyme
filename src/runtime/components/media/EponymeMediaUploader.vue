<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed, ref } from 'vue'
import EPButton from '../ui/EPButton.vue'
import { checkEponymeFile, useEponymeStorageSettings } from '../../composables/useEponymeMedia'
import type { EponymeMediaItem } from '../../types/storage'
import { getEponymeErrorMessage } from '../../utils/eponyme-error'

const props = withDefaults(defineProps<{
  /** Taken as a prop so the caller's list stays the one the new file is added to. */
  upload: (file: File, onProgress?: (ratio: number) => void) => Promise<EponymeMediaItem>
  accept?: string[]
  maxSize?: number
  label?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
}>(), { accept: () => [], variant: 'secondary' })

const emit = defineEmits<{
  uploaded: [item: EponymeMediaItem]
  error: [message: string]
}>()

const input = ref<HTMLInputElement>()
const busy = ref(false)
const progress = ref(0)
const name = ref('')

const settings = useEponymeStorageSettings()
const acceptAttribute = computed(() => (props.accept.length ? props.accept : settings.accept).join(','))

async function send(file: File) {
  if (props.disabled || busy.value) return

  const problem = checkEponymeFile(file, { accept: props.accept, maxSize: props.maxSize })
  if (problem) {
    emit('error', problem)
    return
  }

  busy.value = true
  progress.value = 0
  name.value = file.name
  try {
    emit('uploaded', await props.upload(file, (ratio) => {
      progress.value = ratio
    }))
  }
  catch (cause) {
    const fallback = cause instanceof Error && cause.message ? cause.message : t('library.uploadFailed')
    emit('error', getEponymeErrorMessage(cause, fallback))
  }
  finally {
    busy.value = false
    name.value = ''
  }
}

async function handleChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  // Cleared before awaiting, so picking the same file twice in a row still fires `change`.
  target.value = ''
  if (!props.disabled && file) await send(file)
}

defineExpose({ send, busy })
</script>

<template>
  <div class="ep:flex ep:min-w-0 ep:items-center ep:gap-3">
    <input
      ref="input"
      type="file"
      class="ep:hidden"
      :accept="acceptAttribute || undefined"
      :disabled="disabled || busy"
      @change="handleChange"
    >
    <EPButton
      icon="mingcute:upload-2-line"
      :variant="variant"
      size="sm"
      :loading="busy"
      :disabled="disabled || busy"
      @click="input?.click()"
    >
      {{ label ?? t('library.upload') }}
    </EPButton>
    <p
      v-if="busy"
      class="ep:m-0 ep:min-w-0 ep:truncate ep:text-xs ep:text-text-muted"
      aria-live="polite"
    >
      {{ t('library.uploading', { name }) }} {{ Math.round(progress * 100) }}%
    </p>
  </div>
</template>
