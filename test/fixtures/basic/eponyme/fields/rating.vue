<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import type { EponymeCustomFieldComponentProps } from '../../../../../src/runtime/types/field.ts'
import type { RatingFieldOptions } from './rating'

withDefaults(defineProps<EponymeCustomFieldComponentProps<number, RatingFieldOptions>>(), {
  errors: () => [],
})
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <label :for="id">{{ label }}</label>
  <input
    :id="id"
    type="number"
    :value="modelValue"
    :min="options.min"
    :max="options.max"
    :required="required"
    :disabled="disabled"
    @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
  >
</template>
