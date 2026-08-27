<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EponymeCustomFieldComponentProps } from '../../../src/runtime/types'
import type { RatingFieldOptions } from './rating'

const props = withDefaults(defineProps<EponymeCustomFieldComponentProps<number, RatingFieldOptions>>(), {
  errors: () => [],
})
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const min = computed(() => props.options.min ?? 1)
const max = computed(() => props.options.max ?? 5)
const scores = computed(() => Array.from({ length: max.value - min.value + 1 }, (_, index) => min.value + index))
const hoveredScore = ref<number | null>(null)
const displayedScore = computed(() => hoveredScore.value ?? props.modelValue ?? min.value - 1)
const descriptionId = computed(() => props.description ? `${props.id}-description` : undefined)
const errorId = computed(() => props.errors.length ? `${props.id}-error` : undefined)
const describedBy = computed(() => [descriptionId.value, errorId.value].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <fieldset
    class="rating-field"
    :disabled="disabled"
    :aria-describedby="describedBy"
  >
    <legend>
      {{ label }}<span v-if="required"> *</span>
    </legend>
    <p
      v-if="description"
      :id="descriptionId"
      class="rating-description"
    >
      {{ description }}
    </p>
    <div
      class="rating-options"
      @mouseleave="hoveredScore = null"
    >
      <template
        v-for="score in scores"
        :key="score"
      >
        <input
          :id="`${id}-${score}`"
          :name="id"
          type="radio"
          :value="score"
          :checked="modelValue === score"
          :required="required"
          :aria-label="`${score} out of ${max} stars`"
          @change="emit('update:modelValue', score)"
        >
        <label
          :for="`${id}-${score}`"
          :class="{ 'rating-star-active': score <= displayedScore }"
          @mouseenter="hoveredScore = score"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 2.5 14.9 8.4l6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z" />
          </svg>
        </label>
      </template>
    </div>
    <div
      :id="`${id}-error`"
      role="alert"
      class="rating-error"
    >
      <p
        v-for="error in errors"
        :key="error"
      >
        {{ error }}
      </p>
    </div>
  </fieldset>
</template>

<style scoped>
.rating-field {
  min-inline-size: 0;
}

legend {
  margin-block-end: 0.375rem;
  color: var(--ep-color-text-default);
  font-size: 0.875rem;
  font-weight: 500;
}

legend span,
.rating-error {
  color: var(--ep-color-danger);
}

.rating-description,
.rating-error {
  margin-block: 0 0.5rem;
  color: var(--ep-color-text-muted);
  font-size: 0.75rem;
  line-height: 1.5;
}

.rating-error {
  margin-block: 0.375rem 0;
  color: var(--ep-color-danger);
}

.rating-error:empty {
  display: none;
}

.rating-error p {
  margin: 0;
}

.rating-options {
  display: inline-flex;
  gap: 0.125rem;
  padding: 0.25rem;
}

.rating-options input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.rating-options label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  border-radius: 0.625rem;
  color: var(--ep-color-border-default);
  cursor: pointer;
  transition: color 140ms ease, filter 140ms ease, transform 140ms ease;
}

.rating-options svg {
  inline-size: 2rem;
  block-size: 2rem;
  fill: currentColor;
}

.rating-options label:hover {
  transform: scale(1.08);
}

.rating-options .rating-star-active {
  color: var(--ep-color-success);
  filter: drop-shadow(0 0.2rem 0.3rem color-mix(in srgb, var(--ep-color-success) 28%, transparent));
}

.rating-options input:focus-visible + label {
  outline: 2px solid var(--ep-color-contrast, #171714);
  outline-offset: 2px;
}

.rating-field:disabled label {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .rating-options label {
    transition: none;
  }

  .rating-options label:hover {
    transform: none;
  }
}
</style>
