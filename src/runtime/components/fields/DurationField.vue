<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed, inject } from 'vue'
import EPInputText from '../ui/EPInputText.vue'
import { formFieldContextKey } from '../ui/form-field-context'
import { joinMilliseconds, splitMilliseconds } from '../../utils/duration'
import type { DurationParts } from '../../utils/duration'

const props = withDefaults(defineProps<{ id: string, modelValue?: unknown, label: string, description?: string, required?: boolean, min?: number, max?: number, errors?: string[], disabled?: boolean }>(), { errors: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const context = inject(formFieldContextKey, {})
const hideLabel = computed(() => context.hideLabel ?? false)
const compact = computed(() => context.compact ?? false)
const parts = computed(() => splitMilliseconds(props.modelValue))
const descriptionId = computed(() => props.description && !hideLabel.value ? `${props.id}-description` : undefined)
const errorId = computed(() => props.errors.length ? `${props.id}-error` : undefined)
const describedBy = computed(() => [descriptionId.value, errorId.value].filter(Boolean).join(' ') || undefined)

const units: Array<{ key: keyof DurationParts, short: string, label: string, max?: number }> = [
  { key: 'hours', short: 'h', label: t('duration.hours') },
  { key: 'minutes', short: 'min', label: t('duration.minutes'), max: 59 },
  { key: 'seconds', short: 's', label: t('duration.seconds'), max: 59 },
  { key: 'milliseconds', short: 'ms', label: t('duration.milliseconds'), max: 999 },
]

function updatePart(key: keyof DurationParts, value: string | number, max?: number) {
  const numeric = value === '' ? 0 : Number(value)
  if (!Number.isFinite(numeric)) return
  const next = Math.max(0, Math.min(Math.trunc(numeric), max ?? Math.floor(Number.MAX_SAFE_INTEGER / 3_600_000)))
  emit('update:modelValue', joinMilliseconds({ ...parts.value, [key]: next }))
}
</script>

<template>
  <fieldset
    class="ep:min-w-0 ep:border-0 ep:p-0"
    :aria-describedby="describedBy"
    :aria-invalid="errors.length ? true : undefined"
    :aria-required="required || undefined"
  >
    <legend
      class="ep:w-fit ep:font-medium ep:text-text-ep"
      :class="[
        hideLabel ? 'ep:sr-only' : 'ep:mb-1.5',
        compact ? 'ep:text-xs' : 'ep:text-sm',
      ]"
    >
      {{ label }}<span
        v-if="required"
        class="ep:text-danger-ep"
      > *</span>
    </legend>
    <p
      v-if="description && !hideLabel"
      :id="descriptionId"
      class="ep:mt-0 ep:mb-2 ep:text-xs ep:leading-relaxed ep:text-muted-ep"
    >
      {{ description }}
    </p>
    <div class="ep:grid ep:grid-cols-2 ep:gap-2 ep:sm:grid-cols-4">
      <label
        v-for="unit in units"
        :key="unit.key"
        :for="`${id}-${unit.key}`"
        class="ep:relative ep:min-w-0"
      >
        <span class="ep:sr-only">{{ unit.label }}</span>
        <EPInputText
          :id="`${id}-${unit.key}`"
          :model-value="parts[unit.key]"
          type="number"
          inputmode="numeric"
          min="0"
          :max="unit.max"
          step="1"
          :invalid="Boolean(errors.length)"
          :disabled="disabled"
          class="ep:pr-12"
          @update:model-value="updatePart(unit.key, $event, unit.max)"
        />
        <span
          aria-hidden="true"
          class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:right-4 ep:-translate-y-1/2 ep:text-xs ep:text-muted-ep"
        >{{ unit.short }}</span>
      </label>
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
  </fieldset>
</template>
