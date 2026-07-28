<script setup lang="ts">
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from 'reka-ui'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  value: string
  disabled?: boolean
}>(), {
  modelValue: false,
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const activeValue = computed(() => props.modelValue ? props.value : undefined)
</script>

<template>
  <AccordionRoot
    type="single"
    collapsible
    :model-value="activeValue"
    class="ep:w-full ep:min-w-0"
    @update:model-value="emit('update:modelValue', $event === value)"
  >
    <AccordionItem
      :value="value"
      :disabled="disabled"
      class="ep:w-full ep:min-w-0"
    >
      <AccordionHeader
        as="div"
        class="ep:group ep:relative ep:w-full ep:min-w-0"
      >
        <slot name="header" />
        <AccordionTrigger
          class="ep:group ep:absolute ep:top-1/2 ep:right-1.5 ep:flex ep:h-7 ep:w-7 ep:-translate-y-1/2 ep:cursor-pointer ep:items-center ep:justify-center ep:rounded-md ep:border-0 ep:bg-transparent ep:text-muted-ep ep:transition ep:hover:bg-theme-ep ep:hover:text-white ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-white/20"
          :aria-label="modelValue ? 'Close folder' : 'Open folder'"
        >
          <Icon
            name="mingcute:down-small-line"
            size="18"
            aria-hidden="true"
            class="ep:transition-transform ep:group-data-[state=closed]:-rotate-90"
          />
        </AccordionTrigger>
        <div
          v-if="$slots.action"
          class="ep:absolute ep:top-1/2 ep:right-9 ep:-translate-y-1/2 ep:opacity-0 ep:transition ep:group-hover:opacity-100 ep:focus-within:opacity-100"
        >
          <slot name="action" />
        </div>
      </AccordionHeader>
      <AccordionContent class="eponyme-accordion-content ep:overflow-hidden ep:pt-1 ep:text-muted-ep">
        <slot />
      </AccordionContent>
    </AccordionItem>
  </AccordionRoot>
</template>

<style scoped>
.eponyme-accordion-content[data-state="open"] {
  animation: eponyme-accordion-down 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.eponyme-accordion-content[data-state="closed"] {
  animation: eponyme-accordion-up 140ms ease-in;
}

@keyframes eponyme-accordion-down {
  from {
    height: 0;
    opacity: 0;
  }
  to {
    height: var(--reka-accordion-content-height);
    opacity: 1;
  }
}

@keyframes eponyme-accordion-up {
  from {
    height: var(--reka-accordion-content-height);
    opacity: 1;
  }
  to {
    height: 0;
    opacity: 0;
  }
}
</style>
