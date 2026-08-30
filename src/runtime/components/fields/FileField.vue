<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed, nextTick, ref } from 'vue'
import EPButton from '../ui/EPButton.vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import EponymeMediaPicker from '../media/EponymeMediaPicker.vue'
import EponymeMediaUploader from '../media/EponymeMediaUploader.vue'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import { checkEponymeFile, useEponymeMedia, useEponymeStorageSettings } from '../../composables/useEponymeMedia'
import { eponymeImageSourceError, isEponymeImageSourceAllowed } from '../../utils/image-source-message'
import type { EponymeMediaItem } from '../../types/storage'
import type { ImageSource } from '../../types/field'

const props = withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  accept?: string[]
  maxSize?: number
  /** Renders the value as a picture rather than as a file name. Set by `field.image()`. */
  preview?: boolean
  /** Origins the value may come from. Set by `field.image()`; a file takes any of them. */
  sources?: readonly ImageSource[]
  errors?: string[]
  disabled?: boolean
}>(), { errors: () => [], accept: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const auth = useEponymeAuth()
const mediaResource = { kind: 'system' as const, name: 'media' }
const settings = useEponymeStorageSettings()
const { upload } = useEponymeMedia()
const pickerOpen = ref(false)
const dragging = ref(false)
const uploadError = ref('')
const sourceError = ref('')
const progress = ref(-1)
const addressOpen = ref(false)
const addressInput = ref<{ $el?: HTMLInputElement }>()
/**
 * A field that takes no uploaded image has no reason to show an uploader or the library, and one
 * that takes only uploads has no reason to offer a text box. The API refuses the same values, so
 * what is hidden here is a control that could only ever have produced an error.
 */
const allows = (source: ImageSource) => !props.sources?.length || props.sources.includes(source)
const allowsUpload = computed(() => allows('upload'))
const allowsAddress = computed(() => allows('absolute') || allows('relative'))
const canReadMedia = computed(() => !props.disabled && allowsUpload.value && auth.can('media.read', mediaResource))
const canUpload = computed(() => !props.disabled && allowsUpload.value && auth.can('media.upload', mediaResource))

/** Typed by hand, so it is worth saying before a save comes back with the same refusal. */
function setAddress(next: string) {
  const address = next.trim()
  const refused = Boolean(address) && props.sources?.length && !isEponymeImageSourceAllowed(address, props.sources)
  sourceError.value = refused && props.sources ? eponymeImageSourceError(props.sources) : ''
  emit('update:modelValue', next)
}

async function openAddress() {
  addressOpen.value = !addressOpen.value
  if (!addressOpen.value) return
  // Revealing a field nobody is typing in is half a control; the caret belongs in it.
  await nextTick()
  addressInput.value?.$el?.focus()
}

const value = computed(() => typeof props.modelValue === 'string' ? props.modelValue : '')
const fileName = computed(() => {
  const path = value.value.split('?')[0] ?? ''
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || value.value
})

function apply(item: EponymeMediaItem) {
  uploadError.value = ''
  addressOpen.value = false
  emit('update:modelValue', item.url)
}

async function send(file: File) {
  if (!canUpload.value) return

  const problem = checkEponymeFile(file, { accept: props.accept, maxSize: props.maxSize })
  if (problem) {
    uploadError.value = problem
    return
  }
  uploadError.value = ''
  progress.value = 0
  try {
    apply(await upload(file, (ratio) => {
      progress.value = ratio
    }))
  }
  catch (cause) {
    uploadError.value = (cause as Error)?.message || t('library.uploadFailed')
  }
  finally {
    progress.value = -1
  }
}

function handleDrop(event: DragEvent) {
  dragging.value = false
  if (!canUpload.value) return
  const file = event.dataTransfer?.files?.[0]
  if (file) void send(file)
}

function handleDragOver() {
  dragging.value = canUpload.value
}
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="[...errors, ...(uploadError ? [uploadError] : []), ...(sourceError ? [sourceError] : [])]"
  >
    <template v-if="!settings.enabled">
      <EPInputText
        :id="id"
        :model-value="value"
        type="url"
        :placeholder="placeholder"
        :required="required"
        :invalid="Boolean(errors.length || sourceError)"
        :disabled="disabled"
        @update:model-value="setAddress(String($event))"
      />
      <p class="ep:mt-1.5 ep:mb-0 ep:text-[11px] ep:text-text-muted">
        {{ t('file.storageOff') }}
      </p>
    </template>

    <template v-else>
      <div
        v-if="!value || addressOpen"
        class="ep:flex ep:flex-col ep:items-center ep:justify-center ep:gap-2 ep:rounded-xl ep:border ep:border-dashed ep:px-4 ep:py-8 ep:transition"
        :class="dragging ? 'ep:border-contrast ep:bg-surface-active' : 'ep:border-border-default'"
        @dragover.prevent="handleDragOver"
        @dragleave="dragging = false"
        @drop.prevent="handleDrop"
      >
        <p
          v-if="progress >= 0"
          class="ep:m-0 ep:text-sm ep:text-text-muted"
          aria-live="polite"
        >
          {{ t('library.uploading', { name: '' }) }} {{ Math.round(progress * 100) }}%
        </p>
        <template v-else>
          <p class="ep:m-0 ep:text-sm ep:text-text-muted">
            {{ t('file.drop') }}
          </p>
          <div class="ep:flex ep:flex-wrap ep:items-center ep:justify-center ep:gap-2">
            <template v-if="allowsUpload">
              <EponymeMediaUploader
                :accept="accept"
                :max-size="maxSize"
                :upload="upload"
                :label="t('file.choose')"
                :disabled="!canUpload"
                @uploaded="apply"
                @error="uploadError = $event"
              />
              <span class="ep:text-xs ep:text-text-muted">{{ t('file.or') }}</span>
              <EPButton
                size="sm"
                variant="secondary"
                icon="mingcute:pic-line"
                :disabled="!canReadMedia"
                @click="pickerOpen = true"
              >
                {{ t('library.pick') }}
              </EPButton>
            </template>
            <span
              v-if="allowsUpload && allowsAddress"
              class="ep:text-xs ep:text-text-muted"
            >{{ t('file.or') }}</span>
            <EPButton
              v-if="allowsAddress"
              size="sm"
              variant="ghost"
              icon="mingcute:link-2-line"
              :disabled="disabled"
              :aria-expanded="addressOpen"
              @click="openAddress"
            >
              {{ t('file.address') }}
            </EPButton>
          </div>
          <EPInputText
            v-if="addressOpen"
            ref="addressInput"
            :model-value="value"
            type="url"
            size="sm"
            class="ep:mt-1 ep:w-full ep:max-w-sm"
            :placeholder="placeholder || 'https://'"
            :aria-label="t('file.address')"
            :disabled="disabled"
            @update:model-value="setAddress(String($event))"
          />
        </template>
      </div>

      <div
        v-else
        class="ep:flex ep:w-full ep:min-w-0 ep:max-w-full ep:flex-col ep:gap-3 ep:overflow-hidden ep:rounded-xl ep:border ep:border-border-default ep:p-3 ep:sm:flex-row ep:sm:items-center"
      >
        <div class="ep:flex ep:w-full ep:min-w-0 ep:max-w-full ep:items-center ep:gap-3 ep:sm:flex-1">
          <img
            v-if="preview"
            :src="value"
            :alt="label"
            class="ep:h-16 ep:w-16 ep:shrink-0 ep:rounded-lg ep:border ep:border-border-default ep:object-cover"
          >
          <Icon
            v-else
            name="mingcute:file-line"
            size="24"
            aria-hidden="true"
            class="ep:shrink-0 ep:text-text-muted"
          />
          <div class="ep:min-w-0 ep:flex-1">
            <p class="ep:m-0 ep:break-all ep:whitespace-normal ep:text-sm ep:font-medium ep:text-text-strong">
              {{ fileName }}
            </p>
            <a
              :href="value"
              target="_blank"
              rel="noopener"
              class="ep:hidden ep:text-xs ep:text-text-muted ep:sm:inline"
            >{{ t('file.open') }}</a>
          </div>
        </div>
        <div class="ep:flex ep:w-full ep:max-w-full ep:flex-col ep:gap-2 ep:sm:w-auto ep:sm:flex-row ep:sm:shrink-0">
          <EPButton
            variant="ghost"
            :href="value"
            target="_blank"
            rel="noopener"
            size="sm"
          >
            {{ t('file.open') }}
          </EPButton>
          <div class="ep:flex ep:w-full ep:gap-1 ep:sm:w-auto">
            <EPButton
              size="sm"
              variant="primary"
              class="ep:flex-1 ep:sm:flex-none"
              :disabled="disabled"
              @click="allowsUpload ? (pickerOpen = true) : openAddress()"
            >
              {{ t('file.replace') }}
            </EPButton>
            <EPButton
              size="sm"
              variant="danger"
              class="ep:flex-1 ep:sm:flex-none ep:md:hidden"
              :disabled="disabled"
              @click="emit('update:modelValue', '')"
            >
              {{ t('file.remove') }}
            </EPButton>
            <EPButton
              :aria-label="t('file.remove')"
              :disabled="disabled"
              icon="mingcute:close-line"
              size="icon"
              variant="ghost"
              class="ep:md:inline-flex! ep:hidden!"
              @click="emit('update:modelValue', '')"
            />
          </div>
        </div>
      </div>

      <ClientOnly>
        <EponymeMediaPicker
          v-model:open="pickerOpen"
          :accept="accept"
          :max-size="maxSize"
          @select="apply"
        />
      </ClientOnly>
    </template>
  </EPFormField>
</template>
