<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

defineProps<{ modelValue?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <CheckboxRoot
    :model-value="modelValue"
    :disabled="disabled"
    class="ep:flex ep:h-5 ep:w-5 ep:shrink-0 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-md ep:border ep:border-border-ep ep:bg-selected-ep ep:text-theme-ep ep:outline-none ep:transition ep:focus-visible:ring-2 ep:focus-visible:ring-white/20 ep:data-[state=checked]:border-white ep:data-[state=checked]:bg-white ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
    @update:model-value="emit('update:modelValue', $event === true)"
  >
    <CheckboxIndicator class="ep:text-xs ep:font-bold">
      ✓
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
