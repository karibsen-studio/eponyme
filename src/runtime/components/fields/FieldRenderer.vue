<script setup lang="ts">
import { computed, provide, reactive, toRef } from 'vue'
import BooleanField from './BooleanField.vue'
import CheckboxGroupField from './CheckboxGroupField.vue'
import ColorField from './ColorField.vue'
import DateField from './DateField.vue'
import DateTimeField from './DateTimeField.vue'
import DurationField from './DurationField.vue'
import FileField from './FileField.vue'
import MediaPlayerField from './MediaPlayerField.vue'
import NumberField from './NumberField.vue'
import PhoneField from './PhoneField.vue'
import RadioField from './RadioField.vue'
import RelationField from './RelationField.vue'
import SelectField from './SelectField.vue'
import SlugField from './SlugField.vue'
import TagsField from './TagsField.vue'
import TextareaField from './TextareaField.vue'
import TextField from './TextField.vue'
import UrlField from './UrlField.vue'
import { LazyRichTextField } from './lazy'
import { eponymeCustomFieldComponents } from '#eponyme/custom-field-components'
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
    case 'custom': {
      const customComponent = eponymeCustomFieldComponents[props.field.name]
      if (!customComponent)
        throw new Error(`[Eponyme] Unknown custom field component "${props.field.name}".`)
      return customComponent
    }
    case 'richText': return LazyRichTextField
    case 'textarea': return TextareaField
    case 'slug': return SlugField
    case 'boolean': return BooleanField
    case 'radio': return RadioField
    case 'checkboxGroup': return CheckboxGroupField
    case 'number': return NumberField
    case 'select': return SelectField
    case 'date': return DateField
    case 'datetime': return DateTimeField
    case 'duration': return DurationField
    case 'file':
    case 'image': return FileField
    case 'color': return ColorField
    case 'relation': return RelationField
    case 'url': return UrlField
    case 'mediaPlayer': return MediaPlayerField
    case 'phone': return PhoneField
    case 'tags': return TagsField
    default: return TextField
  }
})

const specificProps = computed<Record<string, unknown>>(() => {
  const field = props.field
  switch (field.type) {
    case 'custom': return { options: field.options }
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
    case 'tags':
      return {
        suggestions: field.options.suggestions,
        allowCustom: field.options.allowCustom,
        minItems: field.options.minItems,
        maxItems: field.options.maxItems,
        placeholder: field.options.placeholder,
      }
    case 'select':
      return { options: field.options.options, placeholder: field.options.placeholder }
    case 'number':
      return {
        min: field.options.min,
        max: field.options.max,
        step: field.options.step,
        slider: field.options.slider,
        prefix: field.options.prefix,
        suffix: field.options.suffix,
      }
    case 'date':
    case 'datetime':
      return { min: field.options.min, max: field.options.max }
    case 'duration':
      return { min: field.options.min, max: field.options.max }
    case 'boolean':
      return {}
    case 'file':
    case 'image':
      return {
        placeholder: field.options.placeholder,
        accept: field.options.accept,
        maxSize: field.options.maxSize,
        preview: field.type === 'image',
        sources: field.type === 'image' ? field.options.sources : undefined,
      }
    case 'color':
      return { presets: field.options.presets, allowCustom: field.options.allowCustom }
    // The picker reads `to` and `multiple` off the definition itself, which is also what tells it whether
    // the value is a slug or a list of them.
    case 'relation':
      return { definition: field }
    case 'url':
      return { placeholder: field.options.placeholder }
    case 'mediaPlayer':
      return { placeholder: field.options.placeholder, providers: field.options.providers }
    case 'phone':
      return {
        placeholder: field.options.placeholder,
        countries: field.options.countries,
        defaultCountry: field.options.defaultCountry,
        detectCountry: field.options.detectCountry,
        autocomplete: field.options.autocomplete,
      }
    default: {
      const options = field.options as Record<string, unknown>
      return {
        inputType: field.type === 'email' ? 'email' : 'text',
        mask: options.mask,
        placeholder: options.placeholder,
        minLength: options.minLength,
        maxLength: options.maxLength,
        showCounter: options.showCounter,
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
