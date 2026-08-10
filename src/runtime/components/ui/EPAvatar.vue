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
 * DiceBear draws the seeded placeholder, and costs more than every other dependency of this
 * component put together for something purely decorative. It is fetched after mount instead of
 * being bundled into the page, which leaves the initials below showing until it arrives.
 *
 * Nothing is lost by waiting: `AvatarFallback` already renders those initials, so the avatar
 * has a complete visual state from the first paint and simply gains its gradient a moment
 * later. A caller passing `src` never triggers the fetch at all.
 */
const generated = ref('')
const resolvedSrc = computed(() => props.src || generated.value)

let generate: ((seed: string) => string) | undefined

async function loadGenerator() {
  if (generate) return generate
  const [{ Avatar, Style }, { default: glass }] = await Promise.all([
    import('@dicebear/core'),
    import('@dicebear/styles/glass.json', { with: { type: 'json' } }),
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
    class="ep:inline-flex ep:shrink-0 ep:items-center ep:justify-center ep:overflow-hidden ep:rounded-full ep:bg-selected-ep ep:text-xs ep:font-semibold ep:text-text-ep"
    :class="{ sm: 'ep:h-8 ep:w-8', md: 'ep:h-9 ep:w-9', lg: 'ep:h-12 ep:w-12' }[size]"
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
