<script setup lang="ts">
import { useRuntimeConfig } from '#app'
import { computed } from 'vue'
import EponymeScreen from '../components/editor/EponymeScreen.vue'
import EponymeSidebar from '../components/editor/EponymeSidebar.vue'

/**
 * The parent route of every authenticated dashboard page, so the sidebar mounts once and
 * survives navigation instead of being torn down with each page.
 *
 * A Nuxt layout would be the usual answer, but it only renders when the host application's
 * `app.vue` includes `<NuxtLayout>` – which a module cannot require. A parent route belongs
 * to the module, so the shell holds wherever it is installed.
 */
const basePath = computed(() => ((useRuntimeConfig().public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? '/__eponyme').replace(/\/$/, ''))
</script>

<template>
  <EponymeScreen class="ep:flex ep:flex-col ep:md:flex-row ep:md:items-start">
    <EponymeSidebar :base-path="basePath" />
    <NuxtPage />
  </EponymeScreen>
</template>
