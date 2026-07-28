<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string
  invalid?: boolean
  disabled?: boolean
}>(), { modelValue: '' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    class="ep:block ep:min-h-36 ep:w-full ep:min-w-0 ep:resize-none ep:rounded-xl ep:border ep:border-border-ep ep:bg-selected-ep ep:px-4 ep:py-3 ep:font-sans ep:text-sm ep:text-white ep:outline-none ep:transition ep:placeholder:text-muted-ep ep:focus:border-muted-ep ep:focus:ring-2 ep:focus:ring-white/10 ep:aria-invalid:border-danger-ep ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
