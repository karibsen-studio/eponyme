<script setup lang="ts">
import { computed, inject } from 'vue'
import { formFieldContextKey } from './form-field-context'

const props = withDefaults(defineProps<{
  id?: string
  label?: string
  description?: string
  required?: boolean
  errors?: string[]
  /** The parent already renders the label — only the control and its messages are shown. */
  hideLabel?: boolean
  /** Smaller label, for fields nested inside an array item. */
  compact?: boolean
}>(), { errors: () => [], hideLabel: undefined, compact: undefined })

const context = inject(formFieldContextKey, {})
const hideLabel = computed(() => props.hideLabel ?? context.hideLabel ?? false)
const compact = computed(() => props.compact ?? context.compact ?? false)

const descriptionId = computed(() => props.id ? `${props.id}-description` : undefined)
const errorId = computed(() => props.id ? `${props.id}-error` : undefined)
const describedBy = computed(() => [
  props.description ? descriptionId.value : undefined,
  props.errors.length ? errorId.value : undefined,
].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="ep:min-w-0">
    <template v-if="!hideLabel">
      <label
        v-if="label"
        :for="id"
        class="ep:mb-1.5 ep:inline-block ep:w-fit ep:font-medium ep:text-text-ep"
        :class="compact ? 'ep:text-xs' : 'ep:text-sm'"
      >
        {{ label }}<span
          v-if="required"
          class="ep:text-danger-ep"
        > *</span>
      </label>
      <p
        v-if="description"
        :id="descriptionId"
        class="ep:mt-0 ep:mb-2 ep:text-xs ep:leading-relaxed ep:text-muted-ep"
      >
        {{ description }}
      </p>
    </template>
    <div
      class="ep:block ep:min-w-0"
      :aria-describedby="describedBy"
    >
      <slot />
    </div>
    <p
      v-for="(error, index) in errors"
      :id="index === 0 ? errorId : undefined"
      :key="error"
      role="alert"
      class="ep:mt-1.5 ep:text-xs ep:text-danger-ep"
    >
      {{ error }}
    </p>
  </div>
</template>
