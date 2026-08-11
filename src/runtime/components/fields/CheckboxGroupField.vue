<script setup lang="ts">
import EPCheckbox from '../ui/EPCheckbox.vue'
import EPFormField from '../ui/EPFormField.vue'

const props = withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, options: ReadonlyArray<{ label: string, value: string }>, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function checked(value: string) {
  return Array.isArray(props.modelValue) && props.modelValue.includes(value)
}

function update(value: string, enabled: boolean) {
  const current = Array.isArray(props.modelValue) ? props.modelValue.filter((item): item is string => typeof item === 'string') : []
  emit('update:modelValue', enabled ? [...new Set([...current, value])] : current.filter(item => item !== value))
}
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <div class="ep:grid ep:gap-2 ep:sm:grid-cols-2">
      <label
        v-for="option in options"
        :key="option.value"
        class="ep:flex ep:cursor-pointer ep:items-center ep:gap-3 ep:rounded-xl ep:bg-surface-active/40 ep:px-4 ep:py-3 ep:text-sm ep:text-text-default ep:transition ep:border ep:border-border-default"
      >
        <ClientOnly>
          <EPCheckbox
            :model-value="checked(option.value)"
            :disabled="disabled"
            @update:model-value="update(option.value, $event)"
          />
          <template #fallback>
            <span class="ep:h-5 ep:w-5 ep:rounded-md ep:border ep:border-border-default ep:bg-surface-active" />
          </template>
        </ClientOnly>
        {{ option.label }}
      </label>
    </div>
  </EPFormField>
</template>
