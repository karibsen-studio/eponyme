<script setup lang="ts">
import { useRoute, useSeoMeta } from '#app'
import EponymeNavigationLink from '../components/editor/EponymeNavigationLink.vue'
import EponymeSidebar from '../components/editor/EponymeSidebar.vue'
import { useEponymeConfig } from '../composables/useEponymeConfig'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../utils/get-eponyme-schemas'

const config = useEponymeConfig()
const route = useRoute()
const eponymes = getEponymeSchemas(config)
const collections = getEponymeCollections(config)
const forms = getEponymeForms(config)
const entries = { ...eponymes, ...collections, ...forms }

useSeoMeta({ title: 'Eponyme' })

function label(name: string) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
</script>

<template>
  <main class="eponyme-root ep:flex ep:min-h-screen ep:flex-col ep:bg-theme-ep ep:font-sans ep:text-text-ep ep:md:flex-row">
    <EponymeSidebar :base-path="route.path" />
    <section class="ep:mx-auto ep:w-full ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
      <p class="ep:m-0 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
        Eponyme
      </p>
      <h1 class="ep:mt-2 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white">
        Content entries
      </h1>
      <p class="ep:mt-2 ep:text-sm ep:text-muted-ep">
        Choose the content area you want to update.
      </p>
      <nav
        class="ep:mt-8 ep:grid ep:gap-3 ep:sm:grid-cols-2"
        aria-label="Content entries"
      >
        <EponymeNavigationLink
          v-for="(_, name) in entries"
          :key="name"
          :to="`${route.path.replace(/\/$/, '')}/${name}`"
          :label="label(name.split('/').at(-1) ?? name)"
          :description="collections[name] ? 'Collection' : forms[name] ? 'Form' : undefined"
          variant="card"
        />
      </nav>
    </section>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
}
</style>
