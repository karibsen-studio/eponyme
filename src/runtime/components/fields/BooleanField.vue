<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPSwitch from '../ui/EPSwitch.vue'

withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
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
      <EPSwitch
        :id="id"
        :model-value="Boolean(modelValue)"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <template #fallback>
        <span class="ep:block ep:h-6 ep:w-11 ep:rounded-full ep:border ep:border-border-default ep:bg-surface-active" />
      </template>
    </ClientOnly>
  </EPFormField>
</template>
