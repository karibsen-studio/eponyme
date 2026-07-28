<script setup lang="ts">
import { computed } from 'vue'
import EponymeNavigationLink from './EponymeNavigationLink.vue'
import { useEponymeConfig } from '../../composables/useEponymeConfig'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../../utils/get-eponyme-schemas'

const props = defineProps<{ basePath: string, folder: string }>()
const config = useEponymeConfig()
const children = computed(() => {
  const prefix = `${props.folder}/`
  const unique = new Map<string, 'folder' | 'entry' | 'collection' | 'form'>()
  const collections = getEponymeCollections(config)
  const forms = getEponymeForms(config)
  for (const name of [...Object.keys(getEponymeSchemas(config)), ...Object.keys(collections), ...Object.keys(forms)]) {
    if (!name.startsWith(prefix)) continue
    const [child, ...rest] = name.slice(prefix.length).split('/')
    if (!child) continue
    const kind = rest.length ? 'folder' : collections[name] ? 'collection' : forms[name] ? 'form' : unique.get(child) ?? 'entry'
    unique.set(child, kind)
  }
  return [...unique].map(([name, kind]) => ({ name, kind, path: `${props.folder}/${name}` }))
})

function label(name: string) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function descriptionFor(kind: 'folder' | 'entry' | 'collection' | 'form') {
  if (kind === 'folder') return 'Folder'
  if (kind === 'collection') return 'Collection'
  return kind === 'form' ? 'Form' : 'Page'
}
</script>

<template>
  <section class="ep:mx-auto ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <header class="ep:mb-8">
      <p class="ep:m-0 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
        Folder
      </p>
      <h1 class="ep:mt-2 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white">
        {{ label(folder.split('/').at(-1) ?? folder) }}
      </h1>
      <p class="ep:mt-2 ep:text-sm ep:text-muted-ep">
        Choose a page or open a nested folder.
      </p>
    </header>
    <nav
      class="ep:grid ep:gap-3 ep:sm:grid-cols-2"
      :aria-label="`${label(folder)} entries`"
    >
      <EponymeNavigationLink
        v-for="child in children"
        :key="child.path"
        :to="`${basePath}/${child.path}`"
        :label="label(child.name)"
        :description="descriptionFor(child.kind)"
        variant="card"
      />
    </nav>
  </section>
</template>
