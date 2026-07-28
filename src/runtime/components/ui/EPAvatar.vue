<script setup lang="ts">
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui'
import { initials } from '../../utils/initials'

withDefaults(defineProps<{ src?: string, alt?: string, fallback?: string, size?: 'sm' | 'md' | 'lg' }>(), {
  alt: '',
  fallback: '?',
  size: 'md',
})
</script>

<template>
  <AvatarRoot
    class="ep:inline-flex ep:shrink-0 ep:items-center ep:justify-center ep:overflow-hidden ep:rounded-full ep:bg-selected-ep ep:text-xs ep:font-semibold ep:text-text-ep"
    :class="{ sm: 'ep:h-8 ep:w-8', md: 'ep:h-9 ep:w-9', lg: 'ep:h-12 ep:w-12' }[size]"
  >
    <AvatarImage
      v-if="src"
      :src="src"
      :alt="alt"
      class="ep:h-full ep:w-full ep:object-cover"
    />
    <AvatarFallback>{{ initials(fallback) }}</AvatarFallback>
  </AvatarRoot>
</template>
