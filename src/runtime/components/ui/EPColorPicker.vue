<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed } from 'vue'
import { normalizeHexColor, sameHexColor } from '../../utils/normalize-hex-color'

const props = withDefaults(defineProps<{
  id?: string
  modelValue?: string
  /** Clickable palette; an empty list leaves only the custom picker. */
  presets?: ReadonlyArray<{ label: string, value: string }>
  /** Offers the native picker next to the palette; off leaves the presets as the only choices. */
  allowCustom?: boolean
  disabled?: boolean
  invalid?: boolean
}>(), { modelValue: '', presets: () => [], allowCustom: true })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const swatchClasses = 'ep:h-8 ep:w-8 ep:shrink-0 ep:cursor-pointer ep:rounded-lg ep:border ep:border-contrast/15 ep:transition ep:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-contrast/40 ep:disabled:cursor-not-allowed ep:disabled:opacity-50'

/** Falls back to black so the native picker always opens on a valid colour. */
const pickerValue = computed(() => normalizeHexColor(props.modelValue)?.slice(0, 7) ?? '#000000')

const isPreset = computed(() => props.presets.some(preset => sameHexColor(preset.value, props.modelValue)))
const customActive = computed(() => Boolean(props.modelValue) && !isPreset.value)

function select(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
    <button
      v-for="(preset, index) in presets"
      :id="!allowCustom && index === 0 ? id : undefined"
      :key="preset.value"
      type="button"
      :class="[swatchClasses, sameHexColor(preset.value, modelValue) ? 'ep:ring-2 ep:ring-contrast ep:ring-offset-2 ep:ring-offset-surface-raised' : 'ep:hover:scale-110']"
      :style="{ backgroundColor: preset.value }"
      :disabled="disabled"
      :aria-pressed="sameHexColor(preset.value, modelValue)"
      :aria-label="preset.label"
      :title="preset.label"
      @click="select(preset.value)"
    />

    <span
      v-if="allowCustom"
      class="ep:relative ep:inline-flex"
      :class="{ 'ep:ml-1': presets.length }"
    >
      <span
        :class="[swatchClasses, 'ep:flex ep:items-center ep:justify-center ep:bg-surface-input ep:text-sm ep:text-text-muted', customActive ? 'ep:ring-2 ep:ring-contrast ep:ring-offset-2 ep:ring-offset-surface-raised' : '']"
        :style="customActive ? { backgroundColor: pickerValue } : undefined"
        aria-hidden="true"
      >
        <template v-if="!customActive">+</template>
      </span>
      <input
        :id="id"
        type="color"
        :value="pickerValue"
        :disabled="disabled"
        :aria-invalid="invalid || undefined"
        :aria-label="t('color.custom')"
        :title="t('color.custom')"
        class="ep:absolute ep:inset-0 ep:h-full ep:w-full ep:cursor-pointer ep:rounded-full ep:opacity-0 ep:disabled:cursor-not-allowed"
        @input="select(($event.target as HTMLInputElement).value)"
      >
    </span>

    <span class="ep:ml-1 ep:text-sm ep:font-medium ep:text-text-muted">{{ modelValue }}</span>
  </div>
</template>
