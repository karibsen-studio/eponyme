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
  if (props.confirmLoading) return
  emit('cancel')
  emit('update:open', false)
}

function confirmAction() {
  if (props.confirmLoading || props.confirmDisabled) return
  emit('confirm')
  if (props.closeOnConfirm) emit('update:open', false)
}

function updateOpen(open: boolean) {
  if (!open && props.confirmLoading) return
  emit('update:open', open)
}
</script>

<template>
  <EPDialog
    :open="open"
    :title="label"
    :description="description"
    role="alertdialog"
    @update:open="updateOpen"
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
        :disabled="confirmLoading"
        autofocus
        @click="cancel"
      />
      <slot
        name="confirm"
        :confirm="confirmAction"
        :loading="confirmLoading"
        :disabled="confirmDisabled"
      >
        <EPButton
          :label="confirmLabel"
          :variant="confirmVariant"
          :loading="confirmLoading"
          :disabled="confirmDisabled"
          @click="confirmAction"
        />
      </slot>
    </div>
  </EPDialog>
</template>
