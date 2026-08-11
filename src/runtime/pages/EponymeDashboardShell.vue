<script setup lang="ts">
import { useRuntimeConfig } from '#app'
import { computed } from 'vue'
import EponymeSidebar from '../components/editor/EponymeSidebar.vue'
import '../assets/dashboard.css'

/**
 * The parent route of every authenticated dashboard page, so the sidebar mounts once and
 * survives navigation instead of being torn down with each page.
 *
 * A Nuxt layout would be the usual answer, but it only renders when the host application's
 * `app.vue` includes `<NuxtLayout>` — which a module cannot require. A parent route belongs
 * to the module, so the shell holds wherever it is installed.
 */
const basePath = computed(() => ((useRuntimeConfig().public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? '/__eponyme').replace(/\/$/, ''))
</script>

<template>
  <main class="eponyme-root ep:flex ep:min-h-screen ep:flex-col ep:bg-surface-page ep:font-sans ep:text-text-default ep:md:flex-row">
    <EponymeSidebar :base-path="basePath" />
    <NuxtPage />
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
}
</style>
