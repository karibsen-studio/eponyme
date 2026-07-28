<script setup lang="ts">
import type { UrlType, UrlValue } from '../../types'
import { computed, ref } from 'vue'
import EPButton from './EPButton.vue'
import EPDialog from './EPDialog.vue'
import EPInputText from './EPInputText.vue'
import EPRadioButton from './EPRadioButton.vue'
import EPSwitch from './EPSwitch.vue'
import EPTooltip from './EPTooltip.vue'

const props = defineProps<{
  id: string
  label: string
  modelValue?: unknown
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: UrlValue] }>()
const dialogOpen = ref(false)
const draftHref = ref('')
const draftType = ref<UrlType>('external')
const draftOpenInNewTab = ref(false)

const value = computed<UrlValue>(() => {
  if (props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue)) {
    const link = props.modelValue as Partial<UrlValue>
    return {
      href: typeof link.href === 'string' ? link.href : '',
      type: link.type === 'internal' ? 'internal' : 'external',
      openInNewTab: link.openInNewTab === true,
    }
  }
  return { href: '', type: 'external', openInNewTab: false }
})

const typeOptions = [
  { label: 'Internal link', value: 'internal' },
  { label: 'External link', value: 'external' },
]

function openDialog() {
  draftHref.value = value.value.href
  draftType.value = value.value.type
  draftOpenInNewTab.value = value.value.openInNewTab
  dialogOpen.value = true
}

function updateDialogOpen(open: boolean) {
  dialogOpen.value = open
}

function updateType(type: string) {
  draftType.value = type === 'internal' ? 'internal' : 'external'
}

function updateHref(href: string | number) {
  draftHref.value = String(href)
}

function save() {
  emit('update:modelValue', {
    href: draftHref.value.trim(),
    type: draftType.value,
    openInNewTab: draftOpenInNewTab.value,
  })
  dialogOpen.value = false
}

function openLink() {
  if (!value.value.href || typeof window === 'undefined') return
  const href = value.value.type === 'internal'
    ? new URL(value.value.href, window.location.origin).href
    : value.value.href
  window.open(href, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div
    class="ep:flex ep:min-h-12 ep:items-center ep:gap-3 ep:rounded-xl ep:border ep:bg-selected-ep ep:px-3 ep:py-2"
    :class="invalid ? 'ep:border-danger-ep' : 'ep:border-0'"
  >
    <Icon
      name="mingcute:link-2-line"
      size="20"
      class="ep:shrink-0 ep:text-muted-ep"
      aria-hidden="true"
    />
    <div class="ep:min-w-0 ep:flex-1">
      <p class="ep:m-0 ep:truncate ep:text-sm ep:text-white">
        {{ value.href || 'No link configured' }}
      </p>
      <p class="ep:mt-0.5 ep:mb-0 ep:text-[11px] ep:text-muted-ep">
        {{ value.type === 'internal' ? 'Internal' : 'External' }} · {{ value.openInNewTab ? 'New tab' : 'Same tab' }}
      </p>
    </div>
    <EPTooltip content="Open link">
      <EPButton
        variant="ghost"
        icon="mingcute:external-link-line"
        :disabled="!value.href"
        :aria-label="`Open ${label}`"
        @click="openLink"
      />
    </EPTooltip>
    <EPTooltip content="Configure link">
      <EPButton
        :id="id"
        variant="ghost"
        icon="mingcute:settings-3-line"
        :disabled="disabled"
        :aria-label="`Configure ${label}`"
        @click="openDialog"
      />
    </EPTooltip>
  </div>

  <EPDialog
    :open="dialogOpen"
    title="Configure link"
    description="Choose where the link points and how it should open."
    @update:open="updateDialogOpen"
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
        <span class="ep:mb-2 ep:block ep:text-sm ep:font-medium ep:text-white">Destination</span>
        <EPInputText
          :model-value="draftHref"
          :type="draftType === 'external' ? 'url' : 'text'"
          :placeholder="draftType === 'internal' ? '/contact' : (placeholder || 'https://example.com')"
          @update:model-value="updateHref"
        />
        <span class="ep:mt-1.5 ep:block ep:text-xs ep:text-muted-ep">
          {{ draftType === 'internal' ? 'Use a path beginning with / or an anchor beginning with #.' : 'Use a complete HTTP(S) address.' }}
        </span>
      </label>

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
          @click="dialogOpen = false"
        >
          Cancel
        </EPButton>
        <EPButton
          variant="primary"
          @click="save"
        >
          Apply link
        </EPButton>
      </div>
    </div>
  </EPDialog>
</template>
