<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPSelect from '../ui/EPSelect.vue'

withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, placeholder?: string, options: ReadonlyArray<{ label: string, value: string }>, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <ClientOnly>
      <EPSelect
        :id="id"
        :model-value="typeof modelValue === 'string' ? modelValue : ''"
        :options="options"
        :placeholder="placeholder"
        :required="required"
        :invalid="Boolean(errors.length)"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <template #fallback>
        <div class="ep:h-12 ep:w-full ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-active" />
      </template>
    </ClientOnly>
  </EPFormField>
</template>
