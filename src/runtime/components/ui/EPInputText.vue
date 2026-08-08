<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  type?: string
  invalid?: boolean
  disabled?: boolean
  /** `sm` suits dense chrome such as the sidebar search; `md` is the form default. */
  size?: 'sm' | 'md'
  /** Extra room for an icon or shortcut hint overlaid on the input. `true` pads both sides. */
  padded?: boolean | 'start' | 'end'
  /** Drops the input's own background and ring so it can sit inside a styled wrapper. */
  bare?: boolean
}>(), {
  modelValue: '',
  type: 'text',
  size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

const padding = computed(() => {
  if (props.padded === 'start') return 'ep:pr-4 ep:pl-10'
  if (props.padded === 'end') return 'ep:pr-12 ep:pl-4'
  return props.padded ? 'ep:pr-12 ep:pl-10' : 'ep:px-4'
})

const classes = computed(() => [
  'ep:block ep:w-full ep:min-w-0 ep:border-0 ep:text-sm ep:text-white ep:outline-none ep:transition ep:placeholder:text-muted-ep ep:disabled:cursor-not-allowed ep:disabled:opacity-50',
  props.bare
    ? 'ep:h-full ep:bg-transparent ep:p-0'
    : [
        'ep:bg-selected-ep ep:focus:border-muted-ep ep:focus:ring-2 ep:focus:ring-white/10 ep:aria-invalid:border-danger-ep',
        props.size === 'sm' ? 'ep:h-10 ep:rounded-lg' : 'ep:h-12 ep:rounded-xl ep:py-3',
        padding.value,
      ],
  { 'eponyme-date-input': props.type === 'date' || props.type === 'datetime-local' },
])

function update(event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', props.type === 'number' && value !== '' ? Number(value) : value)
}
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :aria-invalid="invalid || undefined"
    :disabled="disabled"
    :class="classes"
    @input="update"
  >
</template>
