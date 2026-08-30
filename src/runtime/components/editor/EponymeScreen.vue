<script setup lang="ts">
import { useRuntimeConfig } from '#app'
import { computed } from 'vue'
import '../../assets/dashboard.css'

defineOptions({ inheritAttrs: false })

const target = computed(() => (useRuntimeConfig().public.eponyme as { teleportTarget?: string } | undefined)?.teleportTarget ?? '#teleports')
</script>

<template>
  <Teleport :to="target">
    <div
      class="eponyme-root ep:bg-surface-page ep:font-sans ep:text-text-default"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
:global(body) {
  margin: 0;
}
</style>
