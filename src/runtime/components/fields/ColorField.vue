<script setup lang="ts">
import { computed } from 'vue'
import EPFormField from '../ui/EPFormField.vue'
import EPColorPicker from '../ui/EPColorPicker.vue'
import type { ColorPreset } from '../../types'
import { normalizeColorPresets, useEponymeColorPresets } from '../../composables/useEponymeColorPresets'

const props = withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  errors?: string[]
  disabled?: boolean
  /** Overrides the module-wide palette for this field only. */
  presets?: ReadonlyArray<string | ColorPreset>
}>(), { errors: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const globalPresets = useEponymeColorPresets()
const presets = computed(() => props.presets ? normalizeColorPresets(props.presets) : globalPresets)
const value = computed(() => typeof props.modelValue === 'string' ? props.modelValue : '')
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <EPColorPicker
      :id="id"
      :model-value="value"
      :presets="presets"
      :disabled="disabled"
      :invalid="Boolean(errors.length)"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </EPFormField>
</template>
