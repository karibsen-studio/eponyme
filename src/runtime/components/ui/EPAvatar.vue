<script setup lang="ts">
import { Avatar, Style } from '@dicebear/core'
import glass from '@dicebear/styles/glass.json' with { type: 'json' }
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui'
import { computed } from 'vue'
import { initials } from '../../utils/initials'

const glassStyle = new Style(glass)

const props = withDefaults(defineProps<{ src?: string, alt?: string, username?: string, fallback?: string, size?: 'sm' | 'md' | 'lg' }>(), {
  alt: '',
  fallback: '?',
  size: 'md',
})

const seed = computed(() => (props.username || props.fallback).trim() || '?')
const resolvedSrc = computed(() => props.src || new Avatar(glassStyle, { seed: seed.value }).toDataUri())
</script>

<template>
  <AvatarRoot
    class="ep:inline-flex ep:shrink-0 ep:items-center ep:justify-center ep:overflow-hidden ep:rounded-full ep:bg-selected-ep ep:text-xs ep:font-semibold ep:text-text-ep"
    :class="{ sm: 'ep:h-8 ep:w-8', md: 'ep:h-9 ep:w-9', lg: 'ep:h-12 ep:w-12' }[size]"
  >
    <AvatarImage
      :src="resolvedSrc"
      :alt="alt"
      class="ep:h-full ep:w-full ep:object-cover"
    />
    <AvatarFallback>{{ initials(seed) }}</AvatarFallback>
  </AvatarRoot>
</template>
