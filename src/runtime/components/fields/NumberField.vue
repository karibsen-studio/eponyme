<script setup lang="ts">
import { computed } from 'vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import EPSlider from '../ui/EPSlider.vue'

const props = withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, min?: number, max?: number, step?: number, slider?: boolean, prefix?: string, suffix?: string, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

const value = computed(() => typeof props.modelValue === 'number' ? props.modelValue : '')

// The compact keypad has no minus key, so a field that accepts a negative keeps the default one.
const inputMode = computed(() => {
  if (props.min === undefined || props.min < 0) return undefined
  return props.step === undefined || Number.isInteger(props.step) ? 'numeric' : 'decimal'
})
</script>

<template>
  <EPFormField
    :id="id"
    :label="label"
    :description="description"
    :required="required"
    :errors="errors"
  >
    <div
      v-if="!slider"
      class="ep:flex ep:h-12 ep:items-center ep:gap-2 ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-input ep:px-4 ep:text-sm ep:transition ep:focus-within:border-text-muted ep:focus-within:ring-2 ep:focus-within:ring-contrast/10"
      :class="errors.length ? 'ep:ring-1 ep:ring-danger' : ''"
    >
      <span
        v-if="prefix"
        aria-hidden="true"
        class="ep:shrink-0 ep:text-text-muted"
      >{{ prefix }}</span>
      <EPInputText
        :id="id"
        bare
        :model-value="value"
        type="number"
        :inputmode="inputMode"
        :min="min"
        :max="max"
        :step="step"
        :required="required"
        :invalid="Boolean(errors.length)"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <span
        v-if="suffix"
        aria-hidden="true"
        class="ep:shrink-0 ep:text-text-muted"
      >{{ suffix }}</span>
    </div>
    <ClientOnly v-else>
      <EPSlider
        :id="id"
        :label="label"
        :model-value="typeof modelValue === 'number' ? modelValue : undefined"
        :min="min"
        :max="max"
        :step="step"
        :prefix="prefix"
        :suffix="suffix"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <template #fallback>
        <span class="ep:block ep:h-10 ep:w-full ep:rounded-lg ep:bg-surface-input" />
      </template>
    </ClientOnly>
  </EPFormField>
</template>
