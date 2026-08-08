<script setup lang="ts">
import { t } from '#eponyme/locale'
import type { UrlType, UrlValue } from '../../types'
import { computed, ref, watch } from 'vue'
import EPButton from './EPButton.vue'
import EPDialog from './EPDialog.vue'
import EPInputText from './EPInputText.vue'
import EPRadioButton from './EPRadioButton.vue'
import EPSwitch from './EPSwitch.vue'
import { getDownloadableExtension } from '../../utils/downloadable-link'

const props = defineProps<{
  open: boolean
  modelValue?: unknown
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: UrlValue]
}>()

const draftHref = ref('')
const draftType = ref<UrlType>('external')
const draftOpenInNewTab = ref(false)
const draftDownload = ref(false)

const value = computed<UrlValue>(() => {
  if (props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue)) {
    const link = props.modelValue as Partial<UrlValue>
    return {
      href: typeof link.href === 'string' ? link.href : '',
      type: link.type === 'internal' ? 'internal' : 'external',
      openInNewTab: link.openInNewTab === true,
      download: link.download === true,
    }
  }
  return { href: '', type: 'external', openInNewTab: false, download: false }
})

const downloadableExtension = computed(() => getDownloadableExtension(draftHref.value))

const typeOptions = [
  { label: t('link.internal'), value: 'internal' },
  { label: t('link.external'), value: 'external' },
]

watch(() => props.open, (open) => {
  if (!open) return
  draftHref.value = value.value.href
  draftType.value = value.value.type
  draftOpenInNewTab.value = value.value.openInNewTab
  draftDownload.value = value.value.download === true
})

function updateType(type: string) {
  draftType.value = type === 'internal' ? 'internal' : 'external'
}

function updateHref(href: string | number) {
  draftHref.value = String(href)
  if (!getDownloadableExtension(draftHref.value)) draftDownload.value = false
}

function apply() {
  emit('update:modelValue', {
    href: draftHref.value.trim(),
    type: draftType.value,
    openInNewTab: draftOpenInNewTab.value,
    download: Boolean(downloadableExtension.value && draftDownload.value),
  })
  emit('update:open', false)
}
</script>

<template>
  <EPDialog
    :open="open"
    title="Configure link"
    description="Choose where the link points and how it should open."
    @update:open="emit('update:open', $event)"
  >
    <div class="ep:grid ep:gap-5">
      <div>
        <p class="ep:mt-0 ep:mb-2 ep:text-sm ep:font-medium ep:text-white">
          Link type
        </p>
        <EPRadioButton
          :model-value="draftType"
          :options="typeOptions"
          @update:model-value="updateType"
        />
      </div>

      <label class="ep:block">
        <span class="ep:mb-2 ep:block ep:text-sm ep:font-medium ep:text-white">{{ t('link.destination') }}</span>
        <EPInputText
          :model-value="draftHref"
          :type="draftType === 'external' ? 'url' : 'text'"
          :placeholder="draftType === 'internal' ? t('link.internalPlaceholder') : (placeholder || t('link.externalPlaceholder'))"
          @update:model-value="updateHref"
        />
        <span class="ep:mt-1.5 ep:block ep:text-xs ep:text-muted-ep">
          {{ draftType === 'internal' ? t('link.internalHint') : t('link.externalHint') }}
        </span>
      </label>

      <div
        v-if="downloadableExtension"
        class="ep:flex ep:items-center ep:justify-between ep:gap-4 ep:rounded-xl ep:bg-selected-ep/40 ep:px-4 ep:py-3"
      >
        <div>
          <p class="ep:m-0 ep:text-sm ep:font-medium ep:text-white">
            Download file
          </p>
          <p class="ep:mt-1 ep:mb-0 ep:text-xs ep:text-muted-ep">
            A .{{ downloadableExtension }} file was detected. Ask the browser to download it instead of opening it.
          </p>
        </div>
        <EPSwitch
          :model-value="draftDownload"
          @update:model-value="draftDownload = $event"
        />
      </div>

      <div class="ep:flex ep:items-center ep:justify-between ep:gap-4 ep:rounded-xl ep:bg-selected-ep/40 ep:px-4 ep:py-3">
        <div>
          <p class="ep:m-0 ep:text-sm ep:font-medium ep:text-white">
            Open in new tab
          </p>
          <p class="ep:mt-1 ep:mb-0 ep:text-xs ep:text-muted-ep">
            Keep the current page open when visitors follow this link.
          </p>
        </div>
        <EPSwitch
          :model-value="draftOpenInNewTab"
          @update:model-value="draftOpenInNewTab = $event"
        />
      </div>

      <div class="ep:flex ep:justify-end ep:gap-2">
        <EPButton
          variant="ghost"
          @click="emit('update:open', false)"
        >
          Cancel
        </EPButton>
        <EPButton
          variant="primary"
          @click="apply"
        >
          Apply link
        </EPButton>
      </div>
    </div>
  </EPDialog>
</template>
