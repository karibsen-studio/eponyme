<script setup lang="ts">
import { computed } from 'vue'
import EPFormField from '../ui/EPFormField.vue'
import EPTagsInput from '../ui/EPTagsInput.vue'
import { normalizeEponymeTags } from '../../utils/normalize-tags'

const props = withDefaults(defineProps<{
  id: string
  modelValue?: unknown
  label: string
  description?: string
  required?: boolean
  suggestions?: readonly string[]
  allowCustom?: boolean
  minItems?: number
  maxItems?: number
  placeholder?: string
  errors?: string[]
  disabled?: boolean
}>(), { errors: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const tags = computed(() => Array.isArray(props.modelValue)
  ? props.modelValue.filter((tag): tag is string => typeof tag === 'string')
  : [])
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
      <EPTagsInput
        :model-value="tags"
        :suggestions="suggestions"
        :allow-custom="allowCustom"
        :placeholder="placeholder"
        :max="maxItems"
        :required="required"
        :disabled="disabled"
        :invalid="Boolean(errors.length)"
        @update:model-value="emit('update:modelValue', normalizeEponymeTags($event, { suggestions, allowCustom }))"
      />
      <template #fallback>
        <div class="ep:min-h-12 ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-active" />
      </template>
    </ClientOnly>
    <p
      v-if="maxItems !== undefined"
      class="ep:mt-1.5 ep:mb-0 ep:text-right ep:text-[11px] ep:text-text-muted"
    >
      {{ tags.length }} / {{ maxItems }}
    </p>
  </EPFormField>
</template>
