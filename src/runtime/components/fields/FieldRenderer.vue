<script setup lang="ts">
import { computed, provide, reactive, toRef } from 'vue'
import BooleanField from './BooleanField.vue'
import CheckboxGroupField from './CheckboxGroupField.vue'
import ColorField from './ColorField.vue'
import DateField from './DateField.vue'
import NumberField from './NumberField.vue'
import PhoneField from './PhoneField.vue'
import RadioField from './RadioField.vue'
import RichTextField from './RichTextField.vue'
import SelectField from './SelectField.vue'
import SlugField from './SlugField.vue'
import TextareaField from './TextareaField.vue'
import TextField from './TextField.vue'
import UrlField from './UrlField.vue'
import { formFieldContextKey } from '../ui/form-field-context'
import type { FieldDefinition } from '../../types'
import { humanizeLabel } from '../../utils/humanize-label'
import { fieldPathId } from '../../utils/field-path'

const props = withDefaults(defineProps<{
  fieldName: string
  field: Exclude<FieldDefinition, { type: 'array' | 'section' | 'tabs' }>
  modelValue?: unknown
  /** Dotted path of this field in the document; defaults to its name at the root. */
  path?: string
  id?: string
  errors?: string[]
  disabled?: boolean
  hideLabel?: boolean
  compact?: boolean
}>(), { errors: () => [] })

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  'enter': []
}>()

provide(formFieldContextKey, reactive({
  hideLabel: toRef(props, 'hideLabel'),
  compact: toRef(props, 'compact'),
}))

const path = computed(() => props.path || props.fieldName)
const id = computed(() => props.id || fieldPathId(path.value))
const label = computed(() => humanizeLabel(props.fieldName, props.field.options.label))

const multiline = computed(() => props.field.type === 'textarea' || props.field.type === 'richText')

const component = computed(() => {
  switch (props.field.type) {
    case 'richText': return RichTextField
    case 'textarea': return TextareaField
    case 'slug': return SlugField
    case 'boolean': return BooleanField
    case 'radio': return RadioField
    case 'checkboxGroup': return CheckboxGroupField
    case 'number': return NumberField
    case 'select': return SelectField
    case 'date': return DateField
    case 'color': return ColorField
    case 'url': return UrlField
    case 'phone': return PhoneField
    default: return TextField
  }
})

/** Options that only some field types carry, forwarded per type. */
const specificProps = computed<Record<string, unknown>>(() => {
  const field = props.field
  switch (field.type) {
    case 'richText':
    case 'textarea':
    case 'slug':
      return {
        placeholder: field.options.placeholder,
        minLength: field.options.minLength,
        maxLength: field.options.maxLength,
        showCounter: field.options.showCounter,
      }
    case 'radio':
    case 'checkboxGroup':
      return { options: field.options.options }
    case 'select':
      return { options: field.options.options, placeholder: field.options.placeholder }
    case 'number':
      return {
        min: field.options.min,
        max: field.options.max,
        step: field.options.step,
        slider: field.options.slider,
      }
    case 'date':
      return { min: field.options.min, max: field.options.max }
    case 'boolean':
      return {}
    case 'color':
      return { presets: field.options.presets }
    case 'url':
      return { placeholder: field.options.placeholder }
    case 'phone':
      return {
        placeholder: field.options.placeholder,
        countries: field.options.countries,
        defaultCountry: field.options.defaultCountry,
        detectCountry: field.options.detectCountry,
        autocomplete: field.options.autocomplete,
      }
    default: {
      // string, email and image all render as a text input, with their own input type.
      // `image` has no length options, hence the presence checks.
      const options = field.options as Record<string, unknown>
      return {
        inputType: field.type === 'image' ? 'url' : field.type === 'email' ? 'email' : 'text',
        placeholder: options.placeholder,
        minLength: options.minLength,
        maxLength: options.maxLength,
        showCounter: options.showCounter,
        preview: field.type === 'image',
      }
    }
  }
})

function handleKeydown(event: KeyboardEvent) {
  if (multiline.value || event.shiftKey) return
  emit('enter')
}
</script>

<template>
  <div
    class="ep:min-w-0"
    @keydown.enter="handleKeydown"
  >
    <component
      :is="component"
      :id="id"
      :model-value="modelValue"
      :label="label"
      :description="field.options.description"
      :required="field.options.required"
      :errors="errors"
      :disabled="disabled"
      v-bind="specificProps"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
