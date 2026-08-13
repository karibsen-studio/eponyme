<script setup lang="ts">
import { vMaska } from 'maska/vue'
import EPInputText from './EPInputText.vue'

defineProps<{
  id: string
  modelValue?: string
  mask: string
  placeholder?: string
  required?: boolean
  invalid?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <EPInputText
    :id="id"
    v-maska="{ mask }"
    :model-value="modelValue"
    :placeholder="placeholder"
    :required="required"
    :invalid="invalid"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>
