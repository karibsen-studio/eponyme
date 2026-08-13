<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useSortable } from '@vueuse/integrations/useSortable'
import { computed, nextTick, ref } from 'vue'
import FieldRenderer from './FieldRenderer.vue'
import type { ArrayFieldDefinition, ArrayItemFieldDefinition } from '../../types'
import type { ValidationErrors } from '../../utils/validate-eponyme-data'
import { getArrayItemDefaultValue, isArrayItemFieldDefinition } from '../../utils/get-field-default-value'
import { isFieldVisible } from '../../utils/is-field-visible'
import { asRecord } from '../../utils/as-record'
import { errorsAt, fieldPathId, joinFieldPath } from '../../utils/field-path'
import EPButton from '../ui/EPButton.vue'

const props = defineProps<{
  fieldName: string
  definition: ArrayFieldDefinition
  modelValue: unknown
  /** Dotted path of this array; items extend it with their index. */
  path?: string
  /** Errors of this subtree, keyed relative to this array (`0.title`, `1`). */
  errors?: ValidationErrors
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: unknown[]] }>()
const items = computed(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const isSimple = computed(() => isArrayItemFieldDefinition(props.definition.options.of))
const objectFields = computed(() => isSimple.value ? [] : Object.entries(props.definition.options.of))
const basePath = computed(() => props.path || props.fieldName)
const sortableRoot = ref<HTMLElement | null>(null)
const sortableItems = computed<unknown[]>({
  get: () => items.value,
  set: (value) => {
    if (!props.disabled) emit('update:modelValue', value)
  },
})

useSortable(sortableRoot, sortableItems, {
  animation: 180,
  disabled: props.disabled,
  draggable: '.eponyme-sortable-item',
  handle: '.eponyme-drag-handle',
  ghostClass: 'eponyme-sortable-ghost',
  chosenClass: 'eponyme-sortable-chosen',
})

function itemLabel(index: number) {
  return (props.definition.options.itemLabel || 'Item $i').replaceAll('$i', String(index + 1))
}

/**
 * One key per shape rather than fragments glued in the template: `3 / 5 items · min 1` is a
 * sentence, and nothing guarantees another language keeps that order.
 */
const counter = computed(() => {
  const { minItems, maxItems } = props.definition.options
  const params = { count: items.value.length, min: minItems ?? 0, max: maxItems ?? 0 }
  if (minItems !== undefined && maxItems !== undefined) return t('array.counterMinMax', params)
  if (maxItems !== undefined) return t('array.counterMax', params)
  return t('array.counterMin', params)
})

function itemPath(index: number, fieldName?: string) {
  const path = joinFieldPath(basePath.value, index)
  return fieldName ? joinFieldPath(path, fieldName) : path
}

/** Error keys inside this array are relative: `0`, `0.title`. */
function itemErrorKey(index: number, fieldName?: string) {
  return fieldName ? `${index}.${fieldName}` : String(index)
}

async function addItem() {
  if (props.disabled) return
  if (props.definition.options.maxItems !== undefined && items.value.length >= props.definition.options.maxItems) return
  const index = items.value.length
  emit('update:modelValue', [...items.value, getArrayItemDefaultValue(props.definition.options.of)])
  await nextTick()
  document.getElementById(fieldPathId(itemPath(index, objectFields.value[0]?.[0])))?.focus()
}

function removeItem(index: number) {
  if (props.disabled) return
  emit('update:modelValue', items.value.filter((_, itemIndex) => itemIndex !== index))
}

function updateItem(index: number, value: unknown) {
  if (props.disabled) return
  const next = [...items.value]
  next[index] = value
  emit('update:modelValue', next)
}

function updateObjectItem(index: number, fieldName: string, value: unknown) {
  updateItem(index, { ...asRecord(items.value[index]), [fieldName]: value })
}

async function handleObjectEnter(index: number, fieldName: string) {
  const itemData = asRecord(items.value[index])
  const fieldIndex = objectFields.value.findIndex(([name]) => name === fieldName)
  const nextField = objectFields.value
    .slice(fieldIndex + 1)
    .find(([, definition]) => isFieldVisible(definition.options, itemData))
  if (nextField) {
    document.getElementById(fieldPathId(itemPath(index, nextField[0])))?.focus()
    return
  }
  await addItem()
}
</script>

<template>
  <div class="ep:grid ep:min-w-0 ep:max-w-full ep:gap-3">
    <div
      ref="sortableRoot"
      class="ep:grid ep:gap-3"
    >
      <div
        v-for="(item, index) in items"
        :key="index"
        class="eponyme-sortable-item"
        :class="isSimple ? 'ep:grid ep:min-w-0 ep:grid-cols-[2rem_minmax(0,1fr)] ep:items-start ep:gap-2 ep:md:grid-cols-[2rem_minmax(0,1fr)_3rem]' : 'ep:min-w-0 ep:max-w-full ep:rounded-xl ep:bg-surface-active/30 ep:p-4'"
      >
        <template v-if="isSimple">
          <button
            type="button"
            class="eponyme-drag-handle ep:flex ep:h-12 ep:w-8 ep:cursor-grab ep:items-center ep:justify-center ep:border-0 ep:bg-transparent ep:text-base ep:tracking-tighter ep:text-text-muted ep:active:cursor-grabbing ep:hover:text-text-strong"
            :disabled="disabled"
            :aria-label="t('array.move', { item: itemLabel(index) })"
            :title="t('array.drag')"
          >
            ⠿
          </button>
          <div class="ep:min-w-0 ep:flex-1">
            <FieldRenderer
              hide-label
              :field-name="fieldName"
              :path="itemPath(index)"
              :field="(definition.options.of as ArrayItemFieldDefinition)"
              :model-value="item"
              :errors="errorsAt(errors, itemErrorKey(index))"
              :disabled="disabled"
              @update:model-value="updateItem(index, $event)"
              @enter="addItem"
            />
          </div>
          <EPButton
            icon="mingcute:close-line"
            class="ep:max-md:hidden"
            :disabled="disabled"
            :aria-label="t('array.remove', { item: itemLabel(index) })"
            @click="removeItem(index)"
          />
          <EPButton
            size="sm"
            variant="danger"
            class="ep:col-start-2 ep:justify-self-start ep:md:hidden"
            :disabled="disabled"
            :aria-label="t('array.delete', { item: itemLabel(index) })"
            @click="removeItem(index)"
          >
            {{ t('action.delete') }}
          </EPButton>
        </template>

        <template v-else>
          <div class="ep:mb-4 ep:flex ep:items-center ep:justify-between ep:gap-3">
            <div class="ep:flex ep:items-center ep:gap-2">
              <button
                type="button"
                class="eponyme-drag-handle ep:flex ep:h-8 ep:w-7 ep:cursor-grab ep:items-center ep:justify-center ep:border-0 ep:bg-transparent ep:text-base ep:tracking-tighter ep:text-text-muted ep:active:cursor-grabbing ep:hover:text-text-strong"
                :disabled="disabled"
                :aria-label="t('array.move', { item: itemLabel(index) })"
                :title="t('array.drag')"
              >
                ⠿
              </button>
              <span class="ep:text-xs ep:font-semibold ep:text-text-muted">{{ itemLabel(index) }}</span>
            </div>
            <EPButton
              icon="mingcute:close-line"
              class="ep:max-md:hidden"
              :aria-label="t('array.remove', { item: itemLabel(index) })"
              :disabled="disabled"
              @click="removeItem(index)"
            />
          </div>
          <div class="ep:grid ep:min-w-0 ep:gap-4">
            <template
              v-for="([itemFieldName, itemDefinition]) in objectFields"
              :key="itemFieldName"
            >
              <FieldRenderer
                v-if="isFieldVisible(itemDefinition.options, asRecord(item))"
                compact
                :field-name="itemFieldName"
                :path="itemPath(index, itemFieldName)"
                :field="itemDefinition"
                :model-value="asRecord(item)[itemFieldName]"
                :errors="errorsAt(errors, itemErrorKey(index, itemFieldName))"
                :disabled="disabled"
                @update:model-value="updateObjectItem(index, itemFieldName, $event)"
                @enter="handleObjectEnter(index, itemFieldName)"
              />
            </template>
          </div>
          <p
            v-for="error in errorsAt(errors, itemErrorKey(index))"
            :key="error"
            role="alert"
            class="ep:mt-2 ep:text-xs ep:text-danger"
          >
            {{ error }}
          </p>
          <EPButton
            size="sm"
            variant="danger"
            class="ep:mt-4 ep:w-full ep:md:hidden"
            :disabled="disabled"
            :aria-label="t('array.delete', { item: itemLabel(index) })"
            @click="removeItem(index)"
          >
            {{ t('action.delete') }}
          </EPButton>
        </template>
      </div>
    </div>

    <div class="ep:flex ep:items-center ep:justify-between ep:gap-3">
      <EPButton
        size="sm"
        class="ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
        :disabled="disabled || (definition.options.maxItems !== undefined && items.length >= definition.options.maxItems)"
        @click="addItem"
      >
        {{ definition.options.addLabel || t('array.add') }}
      </EPButton>
      <span
        v-if="definition.options.showCounter !== false && (definition.options.minItems !== undefined || definition.options.maxItems !== undefined)"
        class="ep:text-[11px] ep:text-text-muted"
      >
        {{ counter }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.eponyme-sortable-ghost {
  opacity: 0.25;
}

.eponyme-sortable-chosen {
  cursor: grabbing;
}
</style>
