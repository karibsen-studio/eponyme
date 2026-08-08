<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import EPFormField from '../ui/EPFormField.vue'
import EPInputText from '../ui/EPInputText.vue'
import { dateTimeToLocalInput, localInputToDateTime } from '../../utils/datetime'

const props = withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, min?: string, max?: string, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const mounted = ref(false)
const localValue = ref('')
const localMin = ref<string>()
const localMax = ref<string>()

onMounted(() => {
  mounted.value = true
  syncLocalValues()
})

watch(() => [props.modelValue, props.min, props.max], () => {
  if (mounted.value) syncLocalValues()
})

function syncLocalValues() {
  localValue.value = dateTimeToLocalInput(props.modelValue)
  localMin.value = props.min ? dateTimeToLocalInput(props.min) : undefined
  localMax.value = props.max ? dateTimeToLocalInput(props.max) : undefined
}

function update(value: string | number) {
  const local = String(value)
  localValue.value = local
  const normalized = localInputToDateTime(local)
  if (normalized !== null) emit('update:modelValue', normalized)
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
      :model-value="localValue"
      type="datetime-local"
      :min="localMin"
      :max="localMax"
      :step="60"
      :required="required"
      :invalid="Boolean(errors.length)"
      :disabled="disabled"
      class="ep:font-sans"
      @update:model-value="update"
    />
  </EPFormField>
</template>
