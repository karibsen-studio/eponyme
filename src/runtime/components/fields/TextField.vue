<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import { LazyMaskedInput } from './lazy'

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
  inputType?: 'text' | 'email' | 'url'
  mask?: string
  errors?: string[]
  disabled?: boolean
}>(), { inputType: 'text', errors: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
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
    <LazyMaskedInput
      v-if="mask"
      :id="id"
      :model-value="value()"
      :mask="mask"
      :placeholder="placeholder"
      :required="required"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <EPInputText
      v-else
      :id="id"
      :model-value="value()"
      :type="inputType"
      :placeholder="placeholder"
      :minlength="minLength"
      :maxlength="maxLength"
      :required="required"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <p
      v-if="maxLength !== undefined && showCounter !== false"
      class="ep:mt-1.5 ep:mb-0 ep:text-right ep:text-[11px] ep:text-text-muted"
    >
      {{ value().length }} / {{ maxLength }}
    </p>
  </EPFormField>
</template>
