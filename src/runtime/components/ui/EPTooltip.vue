<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

withDefaults(defineProps<{ content: string, delay?: number }>(), { delay: 300 })
</script>

<template>
  <TooltipProvider :delay-duration="delay">
    <TooltipRoot>
      <TooltipTrigger
        as="span"
        class="ep:inline-flex"
      >
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side-offset="6"
          class="eponyme-portal ep:z-50 ep:whitespace-nowrap ep:rounded-lg ep:border ep:border-border-ep ep:bg-black ep:px-2.5 ep:py-1.5 ep:font-sans ep:text-xs ep:font-medium ep:text-white"
        >
          {{ content }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
