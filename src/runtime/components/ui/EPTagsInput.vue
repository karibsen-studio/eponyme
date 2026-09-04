<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed, ref } from 'vue'
import {
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  TagsInputRoot,
} from 'reka-ui'

/** Chips plus a row of suggestion buttons, knowing nothing about Eponyme. */
const props = withDefaults(defineProps<{
  modelValue?: string[]
  /** Rendered as clickable buttons below the input, minus the ones already picked. */
  suggestions?: readonly string[]
  /** Whether a value outside `suggestions` may be added. */
  allowCustom?: boolean
  placeholder?: string
  max?: number
  required?: boolean
  disabled?: boolean
  invalid?: boolean
}>(), { modelValue: () => [], suggestions: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const search = ref('')

const available = computed(() => props.suggestions.filter(suggestion => !props.modelValue.some(tag => same(tag, suggestion))))
const full = computed(() => props.max !== undefined && props.modelValue.length >= props.max)

function same(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()
}

function add(value: string) {
  const tag = value.trim()
  if (!tag || full.value) return
  const suggested = props.suggestions.find(suggestion => same(suggestion, tag))
  if (!suggested && !props.allowCustom) return
  if (props.modelValue.some(existing => same(existing, tag))) return
  emit('update:modelValue', [...props.modelValue, suggested ?? tag])
  search.value = ''
}

function remove(tag: string) {
  emit('update:modelValue', props.modelValue.filter(existing => existing !== tag))
}

/** Enter adds what was typed; there is no listbox left to intercept the key. */
function onEnter(event: KeyboardEvent) {
  if (!search.value.trim()) return
  event.preventDefault()
  add(search.value)
}
</script>

<template>
  <div>
    <TagsInputRoot
      :model-value="modelValue"
      :max="max"
      :required="required"
      :disabled="disabled"
      :add-on-paste="false"
      class="ep:flex ep:min-h-12 ep:w-full ep:flex-wrap ep:items-center ep:gap-1.5 ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-input ep:px-2 ep:py-2 ep:transition ep:focus-within:border-text-muted ep:focus-within:ring-2 ep:focus-within:ring-contrast/10 ep:aria-invalid:border-danger"
      :aria-invalid="invalid || undefined"
      @remove-tag="remove"
    >
      <TagsInputItem
        v-for="tag in modelValue"
        :key="tag"
        :value="tag"
        class="ep:flex ep:items-center ep:gap-1 ep:rounded-lg ep:bg-contrast/10 ep:py-1 ep:pr-1 ep:pl-2.5 ep:text-sm ep:text-text-strong"
      >
        <TagsInputItemText />
        <TagsInputItemDelete
          :aria-label="t('tags.remove', { tag })"
          class="ep:flex ep:size-5 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-md ep:border-0 ep:bg-transparent ep:text-text-muted ep:transition ep:hover:bg-contrast/10 ep:hover:text-text-strong"
        >
          <Icon
            name="mingcute:close-line"
            class="ep:size-3.5"
            aria-hidden="true"
          />
        </TagsInputItemDelete>
      </TagsInputItem>

      <input
        v-model="search"
        :placeholder="full ? undefined : placeholder"
        :disabled="disabled || full"
        class="ep:min-w-24 ep:flex-1 ep:border-0 ep:bg-transparent ep:px-2 ep:text-sm ep:text-text-strong ep:outline-none ep:placeholder:text-text-muted ep:disabled:cursor-not-allowed"
        @keydown.enter="onEnter"
      >
    </TagsInputRoot>

    <div
      v-if="available.length"
      class="ep:mt-2 ep:flex ep:flex-wrap ep:gap-1.5"
    >
      <button
        v-for="suggestion in available"
        :key="suggestion"
        type="button"
        :disabled="disabled || full"
        class="ep:cursor-pointer ep:rounded-lg ep:border ep:border-border-default ep:bg-transparent ep:px-2.5 ep:py-1 ep:text-sm ep:text-text-muted ep:transition ep:hover:border-text-muted ep:hover:text-text-strong ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
        @click="add(suggestion)"
      >
        {{ suggestion }}
      </button>
    </div>
  </div>
</template>
