<script setup lang="ts">
import EPFormField from '../ui/EPFormField.vue'
import EPRadioButton from '../ui/EPRadioButton.vue'

withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, options: ReadonlyArray<{ label: string, value: string }>, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
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
      <EPRadioButton
        :model-value="typeof modelValue === 'string' ? modelValue : ''"
        :options="options"
        :required="required"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <template #fallback>
        <div class="ep:grid ep:gap-2 ep:sm:grid-cols-2">
          <div
            v-for="option in options"
            :key="option.value"
            class="ep:h-12 ep:rounded-xl ep:border ep:border-border-ep ep:bg-selected-ep/40"
          />
        </div>
      </template>
    </ClientOnly>
  </EPFormField>
</template>
