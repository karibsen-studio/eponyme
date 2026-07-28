<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { computed } from 'vue'
import EPButton from '../ui/EPButton.vue'

const props = withDefaults(defineProps<{
  value: string
  label?: string
}>(), {
  label: 'Copy',
})

const source = computed(() => props.value)
const { copy, copied, isSupported } = useClipboard({ source })
</script>

<template>
  <div class="ep:flex ep:items-center ep:gap-2 ep:rounded-xl ep:bg-selected-ep ep:p-2">
    <code class="ep:min-w-0 ep:flex-1 ep:break-all ep:px-1 ep:font-mono ep:text-sm ep:text-white">
      {{ value }}
    </code>
    <EPButton
      size="sm"
      variant="secondary"
      :disabled="!isSupported"
      :aria-label="label"
      @click="copy()"
    >
      {{ copied ? 'Copied' : label }}
    </EPButton>
  </div>
</template>
