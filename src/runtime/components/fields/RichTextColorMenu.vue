<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import type { ColorPreset } from '../../types'
import EPColorPicker from '../ui/EPColorPicker.vue'

defineProps<{
  icon: string
  title: string
  presets: ColorPreset[]
  /** The color already applied to the selection, shown under the icon. */
  color?: string
  clearLabel: string
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [value: string], clear: [] }>()

/** Read by the bubble menu, which has to stay open while a color is being picked. */
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="rich-text-tool"
        :disabled="disabled"
        :title="title"
        :aria-label="title"
        @mousedown.prevent
      >
        <Icon
          :name="icon"
          size="18"
          aria-hidden="true"
        />
        <span
          class="ep:absolute ep:inset-x-1.5 ep:bottom-1 ep:h-0.5 ep:rounded-full"
          :style="{ backgroundColor: color || 'transparent' }"
          aria-hidden="true"
        />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side-offset="6"
        align="start"
        class="eponyme-portal ep:w-64 ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-raised ep:p-3 ep:text-text-default ep:shadow-xl"
      >
        <EPColorPicker
          :model-value="color ?? ''"
          :presets="presets"
          @update:model-value="emit('select', $event)"
        />
        <button
          type="button"
          class="ep:mt-3 ep:w-full ep:cursor-pointer ep:rounded-lg ep:bg-surface-active ep:px-3 ep:py-2 ep:text-sm ep:text-text-muted ep:transition ep:hover:text-text-strong"
          @click="emit('clear')"
        >
          {{ clearLabel }}
        </button>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
