<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed } from 'vue'
import { normalizeHexColor, sameHexColor } from '../../utils/normalize-hex-color'

const props = withDefaults(defineProps<{
  /** Lands on the native picker, which is the focusable control the label points at. */
  id?: string
  modelValue?: string
  /** Clickable palette; an empty list leaves only the custom picker. */
  presets?: ReadonlyArray<{ label: string, value: string }>
  disabled?: boolean
  invalid?: boolean
}>(), { modelValue: '', presets: () => [] })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const swatchClasses = 'ep:h-8 ep:w-8 ep:shrink-0 ep:cursor-pointer ep:rounded-lg ep:border ep:border-white/15 ep:transition ep:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-white/40 ep:disabled:cursor-not-allowed ep:disabled:opacity-50'

/** Falls back to black so the native picker always opens on a valid colour. */
const pickerValue = computed(() => normalizeHexColor(props.modelValue)?.slice(0, 7) ?? '#000000')

const isPreset = computed(() => props.presets.some(preset => sameHexColor(preset.value, props.modelValue)))
// The custom swatch takes over as soon as the value leaves the palette.
const customActive = computed(() => Boolean(props.modelValue) && !isPreset.value)

function select(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
    <button
      v-for="preset in presets"
      :key="preset.value"
      type="button"
      :class="[swatchClasses, sameHexColor(preset.value, modelValue) ? 'ep:ring-2 ep:ring-white ep:ring-offset-2 ep:ring-offset-theme-ep' : 'ep:hover:scale-110']"
      :style="{ backgroundColor: preset.value }"
      :disabled="disabled"
      :aria-pressed="sameHexColor(preset.value, modelValue)"
      :aria-label="preset.label"
      :title="preset.label"
      @click="select(preset.value)"
    />

    <span
      class="ep:relative ep:inline-flex"
      :class="{ 'ep:ml-1': presets.length }"
    >
      <span
        :class="[swatchClasses, 'ep:flex ep:items-center ep:justify-center ep:bg-selected-ep ep:text-sm ep:text-muted-ep', customActive ? 'ep:ring-2 ep:ring-white ep:ring-offset-2 ep:ring-offset-theme-ep' : '']"
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

    <span class="ep:ml-1 ep:text-sm ep:font-medium ep:text-muted-ep">{{ modelValue }}</span>
  </div>
</template>
