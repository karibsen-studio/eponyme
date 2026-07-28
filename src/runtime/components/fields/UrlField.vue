<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPLinkEditor from '../ui/EPLinkEditor.vue'

withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  errors?: string[]
  disabled?: boolean
}>(), { errors: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <EPLinkEditor
      :id="id"
      :label="label"
      :model-value="modelValue"
      :placeholder="placeholder"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </EPFormField>
</template>
