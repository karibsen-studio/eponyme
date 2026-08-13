<script setup lang="ts">
import { t } from '#eponyme/locale'
import { createError, useRoute, useSeoMeta } from '#app'
import { computed, defineAsyncComponent } from 'vue'

import EponymeForm from '../components/editor/EponymeForm.vue'
import EponymeFolderNav from '../components/editor/EponymeFolderNav.vue'
import EponymePageNavigation from '../components/editor/EponymePageNavigation.vue'
import { useEponymeConfig } from '../composables/useEponymeConfig'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../utils/get-eponyme-schemas'
import { humanizeLabel as label } from '../utils/humanize-label'
import '../assets/dashboard.css'
/**
 * One of these renders per route, so importing all three made every route pay for the other
 * two. The submissions table alone brings `@tanstack/vue-table`, which a folder or a singleton
 * has no use for. Declared at module scope so each keeps one identity and one chunk.
 */
const EponymeCollectionPage = defineAsyncComponent(() => import('../components/editor/EponymeCollectionPage.vue'))
const EponymeFormPage = defineAsyncComponent(() => import('../components/editor/EponymeFormPage.vue'))
const EponymeFolderPage = defineAsyncComponent(() => import('../components/editor/EponymeFolderPage.vue'))

const route = useRoute()
const config = useEponymeConfig()
const eponymeName = computed(() => Array.isArray(route.params.eponyme) ? route.params.eponyme.join('/') : String(route.params.eponyme))
const schemas = getEponymeSchemas(config)
const collections = getEponymeCollections(config)
const forms = getEponymeForms(config)
const collection = computed(() => collections[eponymeName.value])
const form = computed(() => forms[eponymeName.value])
const collectionEntry = computed(() => Object.entries(collections).find(([name]) => {
  const prefix = `${name}/`
  return eponymeName.value.startsWith(prefix) && !eponymeName.value.slice(prefix.length).includes('/')
}))
const schema = computed(() => schemas[eponymeName.value] ?? collectionEntry.value?.[1].fields ?? {})
const entries = Object.keys(schemas)
const indexPath = computed(() => route.path.slice(0, -(eponymeName.value.length + 1)) || '/')
const isFolder = computed(() => !schemas[eponymeName.value] && !collection.value && !form.value && !collectionEntry.value && [...Object.keys(schemas), ...Object.keys(collections), ...Object.keys(forms)].some(name => name.startsWith(`${eponymeName.value}/`)))

useEponymeFavicon()
useSeoMeta({
  title: () => t('entry.title', { entry: label(eponymeName.value.split('/').at(-1) ?? eponymeName.value) }),
})

if (!schemas[eponymeName.value] && !collection.value && !form.value && !collectionEntry.value && !isFolder.value) throw createError({ statusCode: 404, statusMessage: t('server.entryNotFound') })
</script>

<template>
  <div class="ep:w-full ep:min-w-0 ep:md:flex-1">
    <EponymeFolderPage
      v-if="isFolder"
      :base-path="indexPath"
      :folder="eponymeName"
    />
    <EponymeCollectionPage
      v-else-if="collection"
      :base-path="indexPath"
      :name="eponymeName"
      :definition="collection"
    />
    <EponymeFormPage
      v-else-if="form"
      :name="eponymeName"
      :definition="form"
    />
    <template v-else>
      <EponymeFolderNav
        :base-path="indexPath"
        :eponyme="eponymeName"
        class="ep:sticky ep:top-0 ep:z-50"
      />
      <EponymeForm
        :key="eponymeName"
        :name="eponymeName"
        :schema="schema"
        :readonly-fields="collectionEntry ? [collectionEntry[1].slugField] : []"
      />
      <EponymePageNavigation
        v-if="!collectionEntry"
        :base-path="indexPath"
        :current="eponymeName"
        :entries="entries"
      />
    </template>
  </div>
</template>
