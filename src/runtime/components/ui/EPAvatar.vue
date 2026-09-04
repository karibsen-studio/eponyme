<script setup lang="ts">
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { initials } from '../../utils/initials'

const props = withDefaults(defineProps<{ src?: string, alt?: string, username?: string, fallback?: string, size?: 'sm' | 'md' | 'lg' }>(), {
  alt: '',
  fallback: '?',
  size: 'md',
})

const seed = computed(() => (props.username || props.fallback).trim() || '?')

/**
 * DiceBear draws the seeded placeholder, and costs more than every other dependency of this component put
 * together for something purely decorative.
 */
const generated = ref('')
const resolvedSrc = computed(() => props.src || generated.value)

let generate: ((seed: string) => string) | undefined

async function loadGenerator() {
  if (generate) return generate

  const [{ Avatar, Style }, { default: glass }] = await Promise.all([
    import('@dicebear/core'),
    import('@dicebear/styles/glass.json'),
  ])
  const style = new Style(glass)
  generate = (value: string) => new Avatar(style, { seed: value }).toDataUri()
  return generate
}

async function draw() {
  if (props.src) return
  generated.value = (await loadGenerator())(seed.value)
}

onMounted(draw)
watch(seed, draw)
</script>

<template>
  <AvatarRoot
    class="ep:inline-flex ep:shrink-0 ep:items-center ep:justify-center ep:overflow-hidden ep:rounded-full ep:bg-surface-active ep:text-xs ep:font-semibold ep:text-text-default"
    :class="{ sm: 'ep:size-8', md: 'ep:h-9 ep:w-9', lg: 'ep:h-12 ep:w-12' }[size]"
  >
    <AvatarImage
      v-if="resolvedSrc"
      :src="resolvedSrc"
      :alt="alt"
      class="ep:h-full ep:w-full ep:object-cover"
    />
    <AvatarFallback>{{ initials(seed) }}</AvatarFallback>
  </AvatarRoot>
</template>
