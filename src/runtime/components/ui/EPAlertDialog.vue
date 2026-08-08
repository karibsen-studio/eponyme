<script setup lang="ts">
import { t } from '#eponyme/locale'
import EPButton from './EPButton.vue'
import EPDialog from './EPDialog.vue'

const props = withDefaults(defineProps<{
  open?: boolean
  label: string
  description?: string
  cancelLabel?: string
  confirmLabel?: string
  confirmVariant?: 'primary' | 'secondary' | 'danger'
  confirmLoading?: boolean
  confirmDisabled?: boolean
  closeOnConfirm?: boolean
}>(), {
  cancelLabel: t('action.cancel'),
  confirmLabel: t('action.confirm'),
  confirmVariant: 'primary',
  closeOnConfirm: true,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'cancel': []
  'confirm': []
}>()

defineSlots<{
  trigger?: () => unknown
  default?: () => unknown
  confirm?: (props: { confirm: () => void, loading: boolean, disabled: boolean }) => unknown
}>()

function cancel() {
  emit('cancel')
  emit('update:open', false)
}

function confirm() {
  emit('confirm')
  if (props.closeOnConfirm) emit('update:open', false)
}
</script>

<template>
  <EPDialog
    :open="open"
    :title="label"
    :description="description"
    role="alertdialog"
    @update:open="emit('update:open', $event)"
  >
    <template
      v-if="$slots.trigger"
      #trigger
    >
      <slot name="trigger" />
    </template>

    <slot />

    <div class="ep:mt-6 ep:flex ep:justify-end ep:gap-2">
      <EPButton
        :label="cancelLabel"
        variant="ghost"
        @click="cancel"
      />
      <slot
        name="confirm"
        :confirm="confirm"
        :loading="confirmLoading"
        :disabled="confirmDisabled"
      >
        <EPButton
          :label="confirmLabel"
          :variant="confirmVariant"
          :loading="confirmLoading"
          :disabled="confirmDisabled"
          @click="confirm"
        />
      </slot>
    </div>
  </EPDialog>
</template>
