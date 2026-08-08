<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'
import { computed } from 'vue'

const props = defineProps<{
  id?: string
  label?: string
  modelValue?: number
  min?: number
  max?: number
  step?: number
  prefix?: string
  suffix?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const minValue = computed(() => props.min ?? 0)
const maxValue = computed(() => props.max ?? 100)
const stepValue = computed(() => props.step ?? 1)
const value = computed(() => Math.min(maxValue.value, Math.max(minValue.value, props.modelValue ?? minValue.value)))

function update(values?: number[]) {
  const next = values?.[0]
  if (next !== undefined) emit('update:modelValue', next)
}
</script>

<template>
  <div class="ep:flex ep:items-center ep:gap-4">
    <SliderRoot
      :model-value="[value]"
      :min="minValue"
      :max="maxValue"
      :step="stepValue"
      :disabled="disabled"
      class="ep:relative ep:flex ep:h-10 ep:flex-1 ep:touch-none ep:items-center ep:select-none ep:data-[disabled]:cursor-not-allowed ep:data-[disabled]:opacity-50"
      @update:model-value="update"
    >
      <SliderTrack class="ep:relative ep:h-2 ep:flex-1 ep:overflow-hidden ep:rounded-full ep:border ep:border-border-ep ep:bg-selected-ep">
        <SliderRange class="ep:absolute ep:h-full ep:bg-white" />
      </SliderTrack>
      <SliderThumb
        :id="id"
        :aria-label="label"
        class="ep:block ep:h-5 ep:w-5 ep:cursor-grab ep:rounded-full ep:border-2 ep:border-white ep:bg-theme-ep ep:outline-none ep:transition-colors ep:hover:bg-text-ep ep:focus-visible:ring-2 ep:focus-visible:ring-white/30 ep:active:cursor-grabbing"
      />
    </SliderRoot>
    <output
      :for="id"
      class="ep:min-w-12 ep:rounded-lg ep:bg-selected-ep ep:px-2.5 ep:py-1.5 ep:text-center ep:font-sans ep:text-sm ep:font-medium ep:text-white"
    >
      {{ prefix }}{{ value }}{{ suffix }}
    </output>
  </div>
</template>
