<script setup lang="ts">
import { t } from '#eponyme/locale'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal } from 'reka-ui'
import { ref } from 'vue'
import EPButton from './EPButton.vue'

defineProps<{ role?: 'dialog' | 'alertdialog' }>()
const emit = defineEmits<{ close: [] }>()

const DISMISS_DISTANCE = 96
const DISMISS_VELOCITY = 0.5

const content = ref<{ $el: HTMLElement } | null>(null)
const dragging = ref(false)
const offset = ref(0)
let startY = 0
let startTime = 0

function element() {
  return content.value?.$el
}

function startDrag(event: PointerEvent) {
  dragging.value = true
  offset.value = 0
  startY = event.clientY
  startTime = event.timeStamp
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function drag(event: PointerEvent) {
  if (!dragging.value) return
  offset.value = Math.max(0, event.clientY - startY)
  const sheet = element()
  if (sheet) sheet.style.transform = `translate3d(0, ${offset.value}px, 0)`
}

function endDrag(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const velocity = offset.value / Math.max(1, event.timeStamp - startTime)
  const sheet = element()
  if (sheet) sheet.style.transform = ''
  if (offset.value > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) emit('close')
  offset.value = 0
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="eponyme-sheet-overlay eponyme-portal ep:fixed ep:inset-0 ep:z-50 ep:bg-black/65 ep:backdrop-blur-sm" />
    <DialogContent
      ref="content"
      :role="role"
      :class="[
        'eponyme-sheet eponyme-portal ep:fixed ep:inset-x-0 ep:bottom-0 ep:z-50 ep:flex ep:max-h-[85dvh] ep:flex-col ep:rounded-t-2xl ep:border-0 ep:bg-surface-raised ep:font-sans ep:text-text-default ep:outline-none',
        dragging && 'is-dragging',
      ]"
    >
      <div
        class="ep:flex ep:shrink-0 ep:cursor-grab ep:touch-none ep:justify-center ep:pt-3 ep:pb-1 ep:active:cursor-grabbing"
        @pointerdown="startDrag"
        @pointermove="drag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <span
          aria-hidden="true"
          class="ep:h-1 ep:w-10 ep:rounded-full ep:bg-border-default"
        />
      </div>
      <div class="ep:min-h-0 ep:flex-1 ep:overflow-y-auto ep:px-6 ep:pt-3 ep:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <slot />
      </div>
      <DialogClose as-child>
        <EPButton
          variant="ghost"
          icon="mingcute:close-line"
          class="ep:absolute ep:top-3 ep:right-4"
          :aria-label="t('action.close')"
          :title="t('action.close')"
        />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

<style scoped>
.eponyme-sheet {
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.eponyme-sheet.is-dragging {
  transition: none;
}

.eponyme-sheet[data-state="open"] {
  animation: eponyme-sheet-in 320ms cubic-bezier(0.32, 0.72, 0, 1);
}

.eponyme-sheet[data-state="closed"] {
  animation: eponyme-sheet-out 200ms ease-in;
}

.eponyme-sheet-overlay[data-state="open"] {
  animation: eponyme-sheet-overlay-in 220ms ease-out;
}

.eponyme-sheet-overlay[data-state="closed"] {
  animation: eponyme-sheet-overlay-out 160ms ease-in;
}

@keyframes eponyme-sheet-in {
  from { transform: translate3d(0, 100%, 0); }
  to { transform: translate3d(0, 0, 0); }
}

@keyframes eponyme-sheet-out {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(0, 100%, 0); }
}

@keyframes eponyme-sheet-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes eponyme-sheet-overlay-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .eponyme-sheet,
  .eponyme-sheet-overlay {
    animation-duration: 1ms !important;
    transition: none;
  }
}
</style>
