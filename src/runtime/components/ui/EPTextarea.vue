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
    class="ep:block ep:min-h-36 ep:w-full ep:min-w-0 ep:resize-none ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-input ep:px-4 ep:py-3 ep:font-sans ep:text-sm ep:text-text-strong ep:outline-none ep:transition ep:placeholder:text-text-muted ep:focus:border-text-muted ep:focus:ring-2 ep:focus:ring-contrast/10 ep:aria-invalid:border-danger ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
