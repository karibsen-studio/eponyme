<script setup lang="ts">
import { computed, ref } from 'vue'
import ArrayField from './ArrayField.vue'
import FieldRenderer from './FieldRenderer.vue'
import type { SectionFieldDefinition } from '../../types'
import type { ValidationErrors } from '../../utils/validate-eponyme-data'
import { isFieldVisible } from '../../utils/is-field-visible'
import { humanizeLabel } from '../../utils/humanize-label'
import { asRecord } from '../../utils/as-record'
import { childErrors, errorsAt, fieldPathId, joinFieldPath } from '../../utils/field-path'

const props = defineProps<{
  fieldName: string
  definition: SectionFieldDefinition
  modelValue: unknown
  /** Dotted path of this section; children extend it. */
  path?: string
  /** Errors of this subtree, keyed relative to this section. */
  errors?: ValidationErrors
  hideHeader?: boolean
  hideTopBorder?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()
const open = ref(true)
const fields = computed(() => Object.entries(props.definition.options.fields))
const basePath = computed(() => props.path || props.fieldName)
const sectionData = computed(() => asRecord(props.modelValue))

function fieldPath(name: string) {
  return joinFieldPath(basePath.value, name)
}

function relativePath(name: string) {
  return name
}

function updateField(name: string, value: unknown) {
  emit('update:modelValue', { ...sectionData.value, [name]: value })
}

function focusNextField(name: string) {
  const index = fields.value.findIndex(([fieldName]) => fieldName === name)
  const next = fields.value.slice(index + 1).find(([, definition]) => isFieldVisible(definition.options, sectionData.value))
  if (next) document.getElementById(fieldPathId(fieldPath(next[0])))?.focus()
}
</script>

<template>
  <section :class="hideHeader ? '' : ['ep:border-border-ep ep:pt-5', { 'ep:border-t': !hideTopBorder }]">
    <button
      v-if="!hideHeader"
      type="button"
      class="ep:flex ep:w-full ep:cursor-pointer ep:items-start ep:justify-between ep:gap-4 ep:border-0 ep:bg-transparent ep:p-0 ep:text-left ep:text-text-ep"
      :aria-expanded="open"
      :aria-controls="`${fieldPathId(basePath)}-panel`"
      @click="open = !open"
    >
      <span class="ep:min-w-0 ep:flex-1">
        <span class="ep:block ep:min-w-0 ep:max-w-full ep:text-xl ep:font-semibold ep:tracking-tight ep:text-white ep:[overflow-wrap:anywhere]">
          {{ humanizeLabel(fieldName, definition.options.label) }}
        </span>
        <span
          v-if="definition.options.description"
          class="ep:mt-1 ep:block ep:text-xs ep:leading-relaxed ep:text-muted-ep"
        >
          {{ definition.options.description }}
        </span>
      </span>
      <span
        class="ep:mt-1 ep:shrink-0 ep:text-lg ep:text-muted-ep ep:transition-transform"
        :class="{ 'ep:rotate-90': open }"
        aria-hidden="true"
      >
        ›
      </span>
    </button>

    <div
      v-if="hideHeader || open"
      :id="`${fieldPathId(basePath)}-panel`"
      class="ep:grid ep:gap-5"
      :class="{ 'ep:mt-6': !hideHeader }"
    >
      <template
        v-for="([sectionFieldName, sectionField]) in fields"
        :key="sectionFieldName"
      >
        <div v-if="isFieldVisible(sectionField.options, sectionData)">
          <template v-if="sectionField.type === 'array'">
            <label
              :for="fieldPathId(fieldPath(sectionFieldName))"
              class="ep:mb-1.5 ep:inline-block ep:w-fit ep:text-sm ep:font-medium ep:text-text-ep"
            >{{ humanizeLabel(sectionFieldName, sectionField.options.label) }}<span
              v-if="sectionField.options.required"
              class="ep:text-danger-ep"
            > *</span></label>
            <p
              v-if="sectionField.options.description"
              class="ep:mt-0 ep:mb-2 ep:text-xs ep:leading-relaxed ep:text-muted-ep"
            >
              {{ sectionField.options.description }}
            </p>
            <ArrayField
              :field-name="sectionFieldName"
              :path="fieldPath(sectionFieldName)"
              :definition="sectionField"
              :model-value="sectionData[sectionFieldName]"
              :errors="childErrors(errors, relativePath(sectionFieldName))"
              :disabled="disabled"
              @update:model-value="updateField(sectionFieldName, $event)"
            />
            <p
              v-for="error in errorsAt(errors, relativePath(sectionFieldName))"
              :key="error"
              role="alert"
              class="ep:mt-1.5 ep:text-xs ep:text-danger-ep"
            >
              {{ error }}
            </p>
          </template>
          <FieldRenderer
            v-else
            :field-name="sectionFieldName"
            :path="fieldPath(sectionFieldName)"
            :field="sectionField"
            :model-value="sectionData[sectionFieldName]"
            :errors="errorsAt(errors, relativePath(sectionFieldName))"
            :disabled="disabled"
            @update:model-value="updateField(sectionFieldName, $event)"
            @enter="focusNextField(sectionFieldName)"
          />
        </div>
      </template>
    </div>
  </section>
</template>
