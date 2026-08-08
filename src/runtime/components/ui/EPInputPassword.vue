<script setup lang="ts">
import { t } from '#eponyme/locale'
import { ref } from 'vue'
import EPInputText from './EPInputText.vue'

defineOptions({ inheritAttrs: false })

defineProps<{
  modelValue?: string
  invalid?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const revealed = ref(false)
</script>

<template>
  <div class="ep:relative">
    <EPInputText
      :model-value="modelValue"
      :type="revealed ? 'text' : 'password'"
      :invalid="invalid"
      :disabled="disabled"
      padded="end"
      v-bind="$attrs"
      @update:model-value="emit('update:modelValue', String($event))"
    />
    <button
      type="button"
      class="ep:absolute ep:top-1/2 ep:right-2 ep:flex ep:size-8 ep:-translate-y-1/2 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-lg ep:border-0 ep:bg-transparent ep:text-muted-ep ep:transition ep:hover:bg-white/10 ep:hover:text-white ep:focus-visible:ring-2 ep:focus-visible:ring-white/30 ep:focus-visible:outline-none ep:disabled:cursor-not-allowed ep:disabled:opacity-50"
      :disabled="disabled"
      :aria-label="revealed ? t('password.hide') : t('password.show')"
      :aria-pressed="revealed"
      @click="revealed = !revealed"
    >
      <Icon
        :name="revealed ? 'mingcute:eye-close-line' : 'mingcute:eye-2-line'"
        size="18"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
