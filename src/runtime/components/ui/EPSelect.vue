<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  options: ReadonlyArray<{ label: string, value: string }>
  placeholder?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  size?: 'sm' | 'md'
  /** Classes applied to the portalled menu content. Replaces the default z-index class. */
  contentClass?: string
}>(), { size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const triggerClasses = computed(() => [
  'ep:flex ep:w-full ep:min-w-0 ep:items-center ep:justify-between ep:gap-3 ep:border ep:border-border-ep ep:bg-selected-ep ep:px-4 ep:text-left ep:text-sm ep:text-white ep:outline-none ep:transition ep:focus:border-muted-ep ep:focus:ring-2 ep:focus:ring-white/10 ep:aria-invalid:border-danger-ep ep:disabled:cursor-not-allowed ep:disabled:opacity-50',
  props.size === 'sm' ? 'ep:h-10 ep:rounded-lg' : 'ep:h-12 ep:rounded-xl',
])
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    :required="required"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', String($event ?? ''))"
  >
    <SelectTrigger
      :aria-invalid="invalid || undefined"
      :class="triggerClasses"
    >
      <SelectValue :placeholder="placeholder" />
      <span
        class="ep:text-xs ep:text-muted-ep"
        aria-hidden="true"
      >⌄</span>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="6"
        :class="[
          'eponyme-portal ep:min-w-(--reka-select-trigger-width) ep:overflow-hidden ep:rounded-xl ep:border ep:border-border-ep ep:bg-selected-ep ep:p-1 ep:text-text-ep',
          contentClass || 'ep:z-50',
        ]"
      >
        <SelectViewport>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="ep:relative ep:flex ep:cursor-pointer ep:items-center ep:rounded-lg ep:py-2.5 ep:pr-8 ep:pl-3 ep:text-sm ep:outline-none ep:select-none ep:data-highlighted:bg-white/10"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="ep:absolute ep:right-3">
              ✓
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
