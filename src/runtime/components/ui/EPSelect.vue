<script setup lang="ts">
import { t } from '#eponyme/locale'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: string
  options: ReadonlyArray<{ label: string, value: string }>
  placeholder?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  size?: 'sm' | 'md'
  /** Classes applied to the portalled menu content. Replaces the default z-index class. */
  contentClass?: string
}>(), { size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const search = ref('')
const mobile = ref(false)
let mobileMediaQuery: MediaQueryList | undefined

const selectedLabel = computed(() => props.options.find(option => option.value === props.modelValue)?.label ?? props.placeholder ?? '')
const searchable = computed(() => props.options.length >= (mobile.value ? 3 : 5))
const triggerClasses = computed(() => [
  'ep:flex ep:w-full ep:min-w-0 ep:items-center ep:justify-between ep:gap-3 ep:border ep:border-border-default ep:bg-surface-input ep:px-4 ep:text-left ep:text-sm ep:text-text-strong ep:outline-none ep:transition ep:focus:border-text-muted ep:focus:ring-2 ep:focus:ring-contrast/10 ep:aria-invalid:border-danger ep:disabled:cursor-not-allowed ep:disabled:opacity-50',
  props.size === 'sm' ? 'ep:h-10 ep:rounded-lg' : 'ep:h-12 ep:rounded-xl',
])

function updateMobile(event: MediaQueryList | MediaQueryListEvent) {
  mobile.value = event.matches
}

function openWithKeyboard(event: KeyboardEvent) {
  if (!props.disabled && !open.value)
    (event.currentTarget as HTMLButtonElement).click()
}

function handleOpenChange(value: boolean) {
  open.value = value
  if (!value)
    search.value = ''
}

onMounted(() => {
  mobileMediaQuery = window.matchMedia('(max-width: 639px)')
  updateMobile(mobileMediaQuery)
  mobileMediaQuery.addEventListener('change', updateMobile)
})

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener('change', updateMobile)
})
</script>

<template>
  <ComboboxRoot
    :open="open"
    :model-value="modelValue"
    :required="required"
    :disabled="disabled"
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    @update:open="handleOpenChange"
    @update:model-value="emit('update:modelValue', String($event ?? ''))"
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <button
          v-bind="$attrs"
          type="button"
          :aria-label="typeof $attrs['aria-label'] === 'string' ? $attrs['aria-label'] : null"
          :aria-invalid="invalid || undefined"
          :class="triggerClasses"
          tabindex="0"
          @keydown.down.prevent="openWithKeyboard"
          @keydown.up.prevent="openWithKeyboard"
        >
          <span
            class="ep:min-w-0 ep:truncate"
            :class="modelValue ? 'ep:text-text-strong' : 'ep:text-text-muted'"
          >{{ selectedLabel }}</span>
          <span
            class="ep:text-xs ep:text-text-muted"
            aria-hidden="true"
          >⌄</span>
        </button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="6"
        :class="[
          'eponyme-portal ep:min-w-(--reka-combobox-trigger-width) ep:overflow-hidden ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-input ep:p-1 ep:text-text-default',
          contentClass || 'ep:z-50',
        ]"
      >
        <div
          v-if="searchable"
          class="ep:p-1"
        >
          <ComboboxInput
            v-model="search"
            auto-focus
            :aria-label="t('select.search')"
            :placeholder="t('select.searchPlaceholder')"
            class="ep:h-9 ep:w-full ep:rounded-lg ep:border ep:border-border-default ep:bg-surface-raised ep:px-3 ep:text-sm ep:text-text-strong ep:outline-none ep:placeholder:text-text-muted ep:focus:border-text-muted ep:focus:ring-2 ep:focus:ring-contrast/10"
          />
        </div>
        <ComboboxViewport class="ep:max-h-30 ep:touch-pan-y ep:overscroll-contain ep:sm:max-h-50">
          <ComboboxEmpty class="ep:px-3 ep:py-2.5 ep:text-sm ep:text-text-muted">
            {{ t('select.empty') }}
          </ComboboxEmpty>
          <ComboboxItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :text-value="option.label"
            class="ep:relative ep:flex ep:cursor-pointer ep:items-center ep:rounded-lg ep:py-2.5 ep:pr-8 ep:pl-3 ep:text-sm ep:outline-none ep:select-none ep:data-highlighted:bg-contrast/10"
          >
            <span class="ep:truncate">{{ option.label }}</span>
            <ComboboxItemIndicator class="ep:absolute ep:right-3">
              ✓
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
