<script setup lang="ts">
import TextField from './TextField.vue'
import { normalizeSlug } from '../../utils/normalize-slug'

withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  minLength?: number
  maxLength?: number
  showCounter?: boolean
  errors?: string[]
  disabled?: boolean
}>(), { errors: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <TextField
    :id="id"
    :model-value="modelValue"
    :label="label"
    :description="description"
    :required="required"
    :placeholder="placeholder"
    :min-length="minLength"
    :max-length="maxLength"
    :show-counter="showCounter"
    :errors="errors"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', normalizeSlug(String($event)))"
  />
</template>
