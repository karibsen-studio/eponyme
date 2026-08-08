<script setup lang="ts">
import { t } from '#eponyme/locale'
import type { UrlValue } from '../../types'
import { computed, ref } from 'vue'
import { middleEllipsis } from '../../utils/middle-ellipsis'
import EPButton from './EPButton.vue'
import EPLinkDialog from './EPLinkDialog.vue'
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

function openDialog() {
  dialogOpen.value = true
}

function updateDialogOpen(open: boolean) {
  dialogOpen.value = open
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
        {{ value.href ? middleEllipsis(value.href, 40) : t('link.none') }}
      </p>
      <p class="ep:mt-0.5 ep:mb-0 ep:text-[11px] ep:text-muted-ep">
        {{ value.type === 'internal' ? t('link.kindInternal') : t('link.kindExternal') }} · {{ value.download ? t('link.stateDownload') : value.openInNewTab ? t('link.stateNewTab') : t('link.stateSameTab') }}
      </p>
    </div>
    <EPTooltip :content="t('link.open')">
      <EPButton
        variant="ghost"
        icon="mingcute:external-link-line"
        :disabled="!value.href"
        :aria-label="t('link.openNamed', { field: label })"
        @click="openLink"
      />
    </EPTooltip>
    <EPTooltip :content="t('link.configure')">
      <EPButton
        :id="id"
        variant="ghost"
        icon="mingcute:settings-3-line"
        :disabled="disabled"
        :aria-label="t('link.configureNamed', { field: label })"
        @click="openDialog"
      />
    </EPTooltip>
  </div>

  <EPLinkDialog
    :open="dialogOpen"
    :model-value="value"
    :placeholder="placeholder"
    @update:open="updateDialogOpen"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
