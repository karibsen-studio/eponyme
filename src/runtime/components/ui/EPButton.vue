<script setup lang="ts">
import { computed, useSlots } from 'vue'

const slots = useSlots()

const props = withDefaults(defineProps<{
  label?: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  disabled?: boolean
}>(), {
  variant: 'secondary',
  type: 'button',
})

const resolvedSize = computed(() =>
  props.size ?? (props.icon && !props.label && !slots.default ? 'icon' : 'md'),
)

const classes = computed(() => [
  'ep:inline-flex ep:cursor-pointer ep:items-center ep:justify-center ep:gap-2 ep:rounded-lg ep:border ep:text-sm ep:font-medium ep:transition ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-contrast/30 ep:active:translate-y-px ep:disabled:cursor-not-allowed ep:disabled:opacity-50',
  {
    primary: 'ep:border-contrast/80 ep:bg-contrast ep:shadow-[inset_0_0_1px_#ffffff7a] ep:text-surface-raised ep:hover:bg-text-default',
    secondary: 'ep:border-border-default ep:bg-transparent ep:text-text-muted ep:hover:bg-surface-active ep:hover:text-text-strong',
    ghost: 'ep:border-transparent ep:bg-transparent ep:text-text-muted ep:hover:bg-surface-active ep:hover:text-text-strong',
    danger: 'ep:bg-danger ep:shadow-[inset_0_0_1px_#ffffff7a] ep:border-danger ep:text-always-white',
  }[props.variant],
  {
    sm: 'ep:h-8 ep:px-3 ep:text-xs',
    md: 'ep:h-10 ep:px-5',
    icon: 'ep:h-8 ep:w-8 ep:p-0',
  }[resolvedSize.value],
])
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :class="classes"
  >
    <span
      v-if="loading"
      class="ep:h-1.5 ep:w-1.5 ep:animate-pulse ep:rounded-full ep:bg-current"
      aria-hidden="true"
    />
    <template v-if="label">
      {{ label }}
    </template>
    <slot v-else-if="$slots.default" />
    <Icon
      v-else-if="icon"
      :name="icon"
      size="20"
      aria-hidden="true"
    />
  </button>
</template>
