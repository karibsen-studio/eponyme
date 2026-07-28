<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPTextarea from '../ui/EPTextarea.vue'

const props = withDefaults(defineProps<{
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
const value = () => typeof props.modelValue === 'string' ? props.modelValue : ''
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <EPTextarea
      :id="id"
      :model-value="value()"
      :placeholder="placeholder"
      :minlength="minLength"
      :maxlength="maxLength"
      :required="required"
      :disabled="disabled"
      :invalid="Boolean(errors.length)"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <p
      v-if="maxLength !== undefined && showCounter !== false"
      class="ep:mt-1.5 ep:mb-0 ep:text-right ep:text-[11px] ep:text-muted-ep"
    >
      {{ value().length }} / {{ maxLength }}
    </p>
  </EPFormField>
</template>
