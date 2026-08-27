<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useSortable } from '@vueuse/integrations/useSortable'
import { computed, nextTick, ref, watch } from 'vue'
import FieldRenderer from './FieldRenderer.vue'
import type { ArrayFieldDefinition, ArrayItemFieldDefinition } from '../../types'
import type { ValidationErrors } from '../../utils/validate-eponyme-data'
import { getArrayItemDefaultValue, isArrayItemFieldDefinition } from '../../utils/get-field-default-value'
import { isFieldVisible } from '../../utils/is-field-visible'
import { asRecord } from '../../utils/as-record'
import { errorsAt, fieldPathId, joinFieldPath } from '../../utils/field-path'
import EPButton from '../ui/EPButton.vue'
import EPInputText from '../ui/EPInputText.vue'

const SEARCHABLE_FROM = 8

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
const query = ref('')
/**
 * Which items are unfolded, by index. An index the map does not hold is at the default the
 * schema asked for – which is what lets `collapsed` apply to data that arrives after mount.
 */
const openItems = ref(new Map<number, boolean>())
const sortableItems = computed<unknown[]>({
  get: () => items.value,
  set: (value) => {
    if (!props.disabled) emit('update:modelValue', value)
  },
})

const isFull = computed(() => props.definition.options.maxItems !== undefined && items.value.length >= props.definition.options.maxItems)
const searchable = computed(() => items.value.length >= SEARCHABLE_FROM)
const filtering = computed(() => searchable.value && Boolean(query.value.trim()))

/** Paired with its index, which stays the index in the value even when the list is filtered. */
const visibleItems = computed(() => {
  const rows = items.value.map((item, index) => ({ item, index }))
  if (!filtering.value) return rows
  const needle = query.value.trim().toLowerCase()
  return rows.filter(row => `${itemLabel(row.index)} ${searchableText(row.item)}`.toLowerCase().includes(needle))
})

const sortable = useSortable(sortableRoot, sortableItems, {
  animation: 180,
  disabled: props.disabled,
  draggable: '.eponyme-sortable-item',
  handle: '.eponyme-drag-handle',
  ghostClass: 'eponyme-sortable-ghost',
  chosenClass: 'eponyme-sortable-chosen',
  // Sortable moves the value by index, so the folded state has to follow the same move or it
  // would stay behind on whatever item lands there.
  onEnd: ({ oldIndex, newIndex }) => {
    if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
    remapOpenItems(index => moveIndex(index, oldIndex, newIndex))
  },
})

watch([filtering, () => props.disabled], ([isFiltering, disabled]) => {
  sortable.option('disabled', isFiltering || Boolean(disabled))
})

function searchableText(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(searchableText).join(' ')
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(searchableText).join(' ')
  return String(value)
}

/**
 * `$i` is the position and `$<field>` what the item holds under that name, so a heading reads
 * as the content rather than as a row number. A template that resolves to nothing – a row
 * added a second ago – falls back to the numbered form.
 */
function itemLabel(index: number) {
  const template = props.definition.options.itemLabel
  if (!template) return t('array.item', { index: index + 1 })
  const item = items.value[index]
  const data = asRecord(item)
  const resolved = template.replaceAll(/\$(\w+)/g, (_, token: string) => {
    if (token === 'i') return String(index + 1)
    if (token === 'value') return isSimple.value ? String(item ?? '') : ''
    const value = data[token]
    return value === undefined || value === null ? '' : String(value)
  })
  return resolved.trim() || t('array.item', { index: index + 1 })
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

function isOpen(index: number) {
  return openItems.value.get(index) ?? !props.definition.options.collapsed
}

function toggleItem(index: number) {
  openItems.value = new Map(openItems.value).set(index, !isOpen(index))
}

/** An item folded shut still holds the error, so the heading has to say so. */
function hasErrors(index: number) {
  return Object.keys(props.errors ?? {}).some(key => key === String(index) || key.startsWith(`${index}.`))
}

/** Rebuilds the folded state under new indices; `undefined` drops the entry. */
function remapOpenItems(next: (index: number) => number | undefined) {
  const remapped = new Map<number, boolean>()
  for (const [index, open] of openItems.value) {
    const target = next(index)
    if (target !== undefined) remapped.set(target, open)
  }
  openItems.value = remapped
}

function moveIndex(index: number, from: number, to: number) {
  if (index === from) return to
  if (from < to) return index > from && index <= to ? index - 1 : index
  return index >= to && index < from ? index + 1 : index
}

async function addItem() {
  if (props.disabled || isFull.value) return
  const index = items.value.length
  emit('update:modelValue', [...items.value, getArrayItemDefaultValue(props.definition.options.of)])
  await nextTick()
  document.getElementById(fieldPathId(itemPath(index, objectFields.value[0]?.[0])))?.focus()
}

function removeItem(index: number) {
  if (props.disabled) return
  remapOpenItems(other => other === index ? undefined : other > index ? other - 1 : other)
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
      v-if="searchable"
      class="ep:relative ep:max-w-xs"
    >
      <Icon
        name="mingcute:search-line"
        size="15"
        aria-hidden="true"
        class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:left-3 ep:-translate-y-1/2 ep:text-text-muted"
      />
      <EPInputText
        v-model="query"
        padded="start"
        size="sm"
        type="search"
        :placeholder="t('array.search')"
        :aria-label="t('array.search')"
      />
    </div>

    <div
      ref="sortableRoot"
      class="ep:grid ep:gap-3"
    >
      <div
        v-for="{ item, index } in visibleItems"
        :key="index"
        class="eponyme-sortable-item"
        :class="isSimple ? 'ep:grid ep:min-w-0 ep:grid-cols-[2rem_minmax(0,1fr)] ep:items-start ep:gap-2 ep:md:grid-cols-[2rem_minmax(0,1fr)_3rem]' : 'ep:min-w-0 ep:max-w-full ep:rounded-xl ep:bg-surface-active/30 ep:p-4'"
      >
        <template v-if="isSimple">
          <button
            type="button"
            class="eponyme-drag-handle ep:flex ep:h-12 ep:w-8 ep:cursor-grab ep:items-center ep:justify-center ep:border-0 ep:bg-transparent ep:text-base ep:tracking-tighter ep:text-text-muted ep:active:cursor-grabbing ep:hover:text-text-strong"
            :disabled="disabled || filtering"
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
          <div
            class="ep:flex ep:items-center ep:justify-between ep:gap-3"
            :class="{ 'ep:mb-4': isOpen(index) }"
          >
            <div class="ep:flex ep:min-w-0 ep:items-center ep:gap-2">
              <button
                type="button"
                class="eponyme-drag-handle ep:flex ep:h-8 ep:w-7 ep:cursor-grab ep:items-center ep:justify-center ep:border-0 ep:bg-transparent ep:text-base ep:tracking-tighter ep:text-text-muted ep:active:cursor-grabbing ep:hover:text-text-strong"
                :disabled="disabled || filtering"
                :aria-label="t('array.move', { item: itemLabel(index) })"
                :title="t('array.drag')"
              >
                ⠿
              </button>
              <button
                type="button"
                class="ep:flex ep:min-w-0 ep:cursor-pointer ep:items-center ep:gap-1.5 ep:border-0 ep:bg-transparent ep:p-0 ep:text-left ep:text-xs ep:font-semibold ep:text-text-muted ep:hover:text-text-strong"
                :aria-expanded="isOpen(index)"
                :aria-controls="fieldPathId(itemPath(index))"
                @click="toggleItem(index)"
              >
                <Icon
                  name="mingcute:down-line"
                  size="14"
                  aria-hidden="true"
                  class="ep:shrink-0 ep:transition-transform"
                  :class="{ 'ep:-rotate-90': !isOpen(index) }"
                />
                <span class="ep:min-w-0 ep:truncate">{{ itemLabel(index) }}</span>
              </button>
              <span
                v-if="!isOpen(index) && hasErrors(index)"
                class="ep:shrink-0 ep:text-xs ep:text-danger"
                :title="t('array.itemHasErrors')"
              >●</span>
            </div>
            <EPButton
              icon="mingcute:close-line"
              class="ep:shrink-0 ep:max-md:hidden"
              :disabled="disabled"
              :aria-label="t('array.remove', { item: itemLabel(index) })"
              @click="removeItem(index)"
            />
          </div>
          <div
            v-show="isOpen(index)"
            :id="fieldPathId(itemPath(index))"
          >
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
          </div>
        </template>
      </div>
    </div>

    <p
      v-if="filtering && !visibleItems.length"
      class="ep:m-0 ep:rounded-xl ep:border ep:border-dashed ep:border-border-default ep:p-6 ep:text-center ep:text-sm ep:text-text-muted"
    >
      {{ t('array.noMatch', { query }) }}
    </p>

    <div class="ep:flex ep:items-center ep:justify-between ep:gap-3">
      <EPButton
        size="sm"
        class="ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
        :disabled="disabled || isFull"
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
