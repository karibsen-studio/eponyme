<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'

withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, min?: string, max?: string, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <EPInputText
      :id="id"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      type="date"
      :min="min"
      :max="max"
      :required="required"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      class="ep:font-sans"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </EPFormField>
</template>
