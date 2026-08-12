<script setup lang="ts">
import { t } from '#eponyme/locale'
import { createReusableTemplate, useMediaQuery } from '@vueuse/core'
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import EPButton from './EPButton.vue'
import EPSheet from './EPSheet.vue'

defineProps<{ open?: boolean, title: string, description?: string, role?: 'dialog' | 'alertdialog' }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const [DefineContentTemplate, ReuseContentTemplate] = createReusableTemplate()
const isMobile = useMediaQuery('(max-width: 767px)')
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogTrigger
      v-if="$slots.trigger"
      as-child
    >
      <slot name="trigger" />
    </DialogTrigger>

    <DefineContentTemplate>
      <DialogTitle class="ep:text-xl ep:font-semibold ep:text-text-strong">
        {{ title }}
      </DialogTitle>
      <DialogDescription
        v-if="description"
        class="ep:mt-2 ep:text-sm ep:leading-relaxed ep:text-text-muted"
      >
        {{ description }}
      </DialogDescription>
      <div class="ep:mt-5">
        <slot />
      </div>
    </DefineContentTemplate>

    <EPSheet
      v-if="isMobile"
      :role="role"
      @close="emit('update:open', false)"
    >
      <ReuseContentTemplate />
    </EPSheet>
    <DialogPortal v-else>
      <DialogOverlay class="eponyme-dialog-overlay ep:fixed ep:inset-0 ep:z-50 ep:bg-black/65 ep:backdrop-blur-sm" />
      <DialogContent
        :role="role"
        class="eponyme-dialog-content eponyme-portal ep:fixed ep:top-1/2 ep:left-1/2 ep:z-50 ep:w-[min(32rem,calc(100vw-2rem))] ep:rounded-2xl ep:border-0 ep:bg-surface-raised ep:p-6 ep:font-sans ep:text-text-default ep:outline-none"
      >
        <ReuseContentTemplate />
        <DialogClose as-child>
          <EPButton
            variant="ghost"
            icon="mingcute:close-line"
            class="ep:absolute ep:top-4 ep:right-4"
            :aria-label="t('action.close')"
            :title="t('action.close')"
          />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.eponyme-dialog-content {
  transform: translate(-50%, -50%);
}

.eponyme-dialog-overlay[data-state="open"] {
  animation: eponyme-dialog-overlay-in 220ms ease-out;
}

.eponyme-dialog-overlay[data-state="closed"] {
  animation: eponyme-dialog-overlay-out 140ms ease-in;
}

.eponyme-dialog-content[data-state="open"] {
  animation: eponyme-dialog-content-in 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.eponyme-dialog-content[data-state="closed"] {
  animation: eponyme-dialog-content-out 150ms ease-in;
}

@keyframes eponyme-dialog-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes eponyme-dialog-overlay-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes eponyme-dialog-content-in {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes eponyme-dialog-content-out {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.97);
  }
}

@media (prefers-reduced-motion: reduce) {
  .eponyme-dialog-overlay,
  .eponyme-dialog-content {
    animation-duration: 1ms !important;
  }
}
</style>
