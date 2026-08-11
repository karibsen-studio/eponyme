<script setup lang="ts">
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'

defineProps<{ items: ReadonlyArray<{ label: string, value: string, disabled?: boolean, danger?: boolean }> }>()
const emit = defineEmits<{ select: [value: string] }>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger">
        <button
          type="button"
          class="ep:h-9 ep:rounded-lg ep:border ep:border-border-default ep:px-3 ep:text-text-muted"
        >
          •••
        </button>
      </slot>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :side-offset="6"
        align="end"
        class="eponyme-portal ep:z-50 ep:min-w-44 ep:rounded-xl ep:border ep:border-border-default ep:bg-surface-active ep:p-1 ep:text-text-default"
      >
        <DropdownMenuItem
          v-for="item in items"
          :key="item.value"
          :disabled="item.disabled"
          class="ep:cursor-pointer ep:rounded-lg ep:px-3 ep:py-2.5 ep:text-sm ep:outline-none ep:select-none ep:data-[disabled]:pointer-events-none ep:data-[disabled]:opacity-40 ep:data-[highlighted]:bg-contrast/10"
          :class="{ 'ep:text-danger': item.danger }"
          @select="emit('select', item.value)"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
