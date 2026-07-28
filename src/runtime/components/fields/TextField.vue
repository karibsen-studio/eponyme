<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'

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
  errors?: string[]
  preview?: boolean
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
    <EPInputText
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
      class="ep:mt-1.5 ep:mb-0 ep:text-right ep:text-[11px] ep:text-muted-ep"
    >
      {{ value().length }} / {{ maxLength }}
    </p>
    <img
      v-if="preview && value()"
      :src="value()"
      :alt="label"
      class="ep:mt-3 ep:block ep:max-h-64 ep:max-w-full ep:rounded-xl ep:border ep:border-border-ep ep:object-contain"
    >
  </EPFormField>
</template>
