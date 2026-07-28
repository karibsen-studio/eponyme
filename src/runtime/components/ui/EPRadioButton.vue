<script setup lang="ts">
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui'

defineProps<{
  modelValue?: string
  options: ReadonlyArray<{ label: string, value: string }>
  required?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <RadioGroupRoot
    :model-value="modelValue"
    :required="required"
    :disabled="disabled"
    class="ep:grid ep:gap-2 ep:sm:grid-cols-2"
    @update:model-value="emit('update:modelValue', String($event ?? ''))"
  >
    <label
      v-for="option in options"
      :key="option.value"
      class="ep:flex ep:cursor-pointer ep:items-center ep:gap-3 ep:rounded-xl ep:bg-selected-ep/40 ep:px-4 ep:py-3 ep:text-sm ep:text-text-ep ep:transition ep:hover:border-muted-ep"
    >
      <RadioGroupItem
        :value="option.value"
        class="ep:flex ep:h-5 ep:w-5 ep:items-center ep:justify-center ep:rounded-full ep:border ep:border-border-ep ep:bg-selected-ep ep:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-white/20"
      >
        <RadioGroupIndicator class="ep:block ep:aspect-square ep:h-2.5 ep:w-2.5 ep:rounded-full ep:bg-white" />
      </RadioGroupItem>
      {{ option.label }}
    </label>
  </RadioGroupRoot>
</template>
