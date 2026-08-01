<script setup lang="ts">
import { computed } from 'vue'
import { eponymeMediaEmbedUrl, toMediaPlayerValue } from '../../utils/media-player'

const props = defineProps<{
  modelValue?: unknown
  label?: string
}>()

const media = computed(() => toMediaPlayerValue(props.modelValue))
const embedUrl = computed(() => eponymeMediaEmbedUrl(media.value))
</script>

<template>
  <div class="ep:aspect-video ep:w-full ep:overflow-hidden ep:rounded-xl ep:border ep:border-border-ep ep:bg-black">
    <video
      v-if="media.provider === 'url'"
      :key="embedUrl"
      :src="embedUrl"
      controls
      preload="metadata"
      class="ep:h-full ep:w-full ep:object-contain"
    />
    <iframe
      v-else
      :key="embedUrl"
      :src="embedUrl"
      :title="label || 'Video preview'"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen
      class="ep:h-full ep:w-full ep:border-0"
    />
  </div>
</template>
