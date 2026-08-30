<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useRoute, useRuntimeConfig } from '#app'
import { computed, ref, watch } from 'vue'
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

const route = useRoute()
const main = ref<HTMLElement>()

// The sidebar survives navigation, so nothing moves the focus: it stays on the link that was
// clicked and a screen reader never announces the page it opened.
watch(() => route.fullPath, () => main.value?.focus({ preventScroll: true }))
</script>

<template>
  <EponymeScreen class="ep:flex ep:flex-col ep:md:flex-row ep:md:items-start">
    <a
      href="#eponyme-main"
      class="eponyme-skip-link ep:rounded-md ep:bg-surface-raised ep:px-4 ep:py-2 ep:text-sm ep:font-medium ep:text-text-strong ep:shadow-lg"
    >
      {{ t('sidebar.skipToContent') }}
    </a>
    <EponymeSidebar :base-path="basePath" />
    <main
      id="eponyme-main"
      ref="main"
      tabindex="-1"
      class="ep:min-w-0 ep:flex-1 ep:outline-none"
    >
      <NuxtPage />
    </main>
  </EponymeScreen>
</template>
