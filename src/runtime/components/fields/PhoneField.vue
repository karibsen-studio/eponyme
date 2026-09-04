<script setup lang="ts">
import { computed, ref } from 'vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import type { PhoneFieldOptions } from '../../types/field'
import { ensureEponymePhoneParser, normalizeEponymePhone } from '#eponyme/phone'

const props = withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  countries?: PhoneFieldOptions['countries']
  defaultCountry?: PhoneFieldOptions['defaultCountry']
  detectCountry?: boolean
  autocomplete?: PhoneFieldOptions['autocomplete']
  errors?: string[]
  disabled?: boolean
}>(), { errors: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const value = computed(() => typeof props.modelValue === 'string' ? props.modelValue : '')
const options = computed<PhoneFieldOptions>(() => ({
  countries: props.countries,
  defaultCountry: props.defaultCountry,
  detectCountry: props.detectCountry,
}))
// Rendering this field is the signal that the metadata is worth fetching.
const ready = ref(false)
void ensureEponymePhoneParser().then(() => (ready.value = true))
const parsed = computed(() => {
  void ready.value
  return normalizeEponymePhone(value.value, options.value)
})

/** Stored in E.164, so what leaves this field is canonical. */
function normalize() {
  const next = parsed.value.e164
  if (next && next !== value.value) emit('update:modelValue', next)
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
    <EPInputText
      :id="id"
      :model-value="value"
      type="tel"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :required="required"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', String($event))"
      @blur="normalize"
    />
    <p
      v-if="parsed.e164 && parsed.country"
      class="ep:mt-1.5 ep:mb-0 ep:text-[11px] ep:text-text-muted"
    >
      {{ parsed.country }} · {{ parsed.e164 }}
    </p>
  </EPFormField>
</template>
