<script setup lang="ts">
import { t } from '#eponyme/locale'
import {
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from 'reka-ui'

withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  variant?: 'success' | 'error'
}>(), {
  description: undefined,
  variant: 'success',
})

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()
</script>

<template>
  <ToastProvider
    :duration="4000"
    :label="t('toast.label')"
    swipe-direction="right"
  >
    <ToastRoot
      :open="open"
      class="eponyme-toast eponyme-portal ep:grid ep:w-full ep:grid-cols-[auto_1fr_auto] ep:items-start ep:gap-3 ep:rounded-xl ep:border ep:border-border-ep ep:bg-selected-ep ep:p-4 ep:font-sans ep:text-text-ep ep:outline-none"
      @update:open="emit('update:open', $event)"
    >
      <span
        class="ep:mt-1.5 ep:h-2 ep:w-2 ep:rounded-full"
        :class="variant === 'error' ? 'ep:bg-danger-ep' : 'ep:bg-success-ep'"
        aria-hidden="true"
      />
      <div class="ep:min-w-0">
        <ToastTitle class="ep:m-0 ep:text-sm ep:font-semibold ep:text-white">
          {{ title }}
        </ToastTitle>
        <ToastDescription
          v-if="description"
          class="ep:mt-1 ep:mb-0 ep:text-xs ep:leading-relaxed ep:text-muted-ep"
        >
          {{ description }}
        </ToastDescription>
      </div>
      <ToastClose
        :aria-label="t('toast.close')"
        class="ep:-mt-1 ep:-mr-1 ep:inline-flex ep:h-7 ep:w-7 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-md ep:border-0 ep:bg-transparent ep:text-lg ep:leading-none ep:text-muted-ep ep:transition ep:hover:bg-white/5 ep:hover:text-white ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-white/20"
      >
        <span aria-hidden="true">&times;</span>
      </ToastClose>
    </ToastRoot>

    <ToastViewport class="ep:fixed ep:right-4 ep:bottom-4 ep:z-50 ep:flex ep:w-[calc(100vw-2rem)] ep:max-w-sm ep:list-none ep:flex-col ep:gap-2 ep:p-0 ep:outline-none ep:sm:right-6 ep:sm:bottom-6" />
  </ToastProvider>
</template>

<style>
.eponyme-toast[data-state='open'] {
  animation: eponyme-toast-lift 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: opacity, transform;
}

.eponyme-toast[data-state='closed'] {
  animation: eponyme-toast-out 180ms ease-in both;
}

.eponyme-toast[data-swipe='move'] {
  transform: translateX(var(--reka-toast-swipe-move-x));
}

.eponyme-toast[data-swipe='cancel'] {
  transform: translateX(0);
  transition: transform 180ms ease-out;
}

.eponyme-toast[data-swipe='end'] {
  animation: eponyme-toast-swipe-out 120ms ease-out;
}

@keyframes eponyme-toast-lift {
  0% {
    opacity: 0;
    transform: translateY(36px) scale(0.96);
  }

  75% {
    opacity: 1;
    transform: translateY(-4px) scale(1);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes eponyme-toast-out {
  to {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
}

@keyframes eponyme-toast-swipe-out {
  to {
    transform: translateX(calc(var(--reka-toast-swipe-end-x) + 2rem));
  }
}

@media (prefers-reduced-motion: reduce) {
  .eponyme-toast {
    animation-duration: 1ms !important;
  }
}
</style>
