<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

defineProps<{ modelValue?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <SwitchRoot
    :model-value="modelValue"
    :disabled="disabled"
    class="eponyme-switch ep:relative ep:inline-flex ep:h-6 ep:w-11 ep:shrink-0 ep:cursor-pointer ep:items-center ep:rounded-full ep:border ep:border-border-ep ep:bg-selected-ep ep:p-0.5 ep:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-white/20 ep:data-[state=checked]:border-white ep:data-[state=checked]:bg-white ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SwitchThumb class="eponyme-switch-thumb ep:block ep:h-[18px] ep:w-[18px] ep:rounded-full ep:bg-muted-ep ep:data-[state=checked]:bg-theme-ep" />
  </SwitchRoot>
</template>

<style scoped>
.eponyme-switch {
  transition: background-color 260ms ease-in-out, border-color 260ms ease-in-out;
}

.eponyme-switch-thumb {
  transform: translateX(0);
  transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1), background-color 260ms ease-in-out;
  will-change: transform;
}

.eponyme-switch-thumb[data-state="checked"] {
  transform: translateX(20px);
}
</style>
