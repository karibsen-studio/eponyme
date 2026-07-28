<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import EPSlider from '../ui/EPSlider.vue'

withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, min?: number, max?: number, step?: number, slider?: boolean, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
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
      v-if="!slider"
      :id="id"
      :model-value="typeof modelValue === 'number' ? modelValue : ''"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :required="required"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <ClientOnly v-else>
      <EPSlider
        :id="id"
        :label="label"
        :model-value="typeof modelValue === 'number' ? modelValue : undefined"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <template #fallback>
        <span class="ep:block ep:h-10 ep:w-full ep:rounded-lg ep:bg-selected-ep" />
      </template>
    </ClientOnly>
  </EPFormField>
</template>
