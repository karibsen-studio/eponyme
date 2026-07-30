<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { refreshNuxtData, useRequestFetch, useRoute, useSeoMeta } from '#app'
import type { FetchError } from 'ofetch'
import EponymeNavigationLink from '../components/editor/EponymeNavigationLink.vue'
import EponymeSidebar from '../components/editor/EponymeSidebar.vue'
import EPButton from '../components/ui/EPButton.vue'
import EPDialog from '../components/ui/EPDialog.vue'
import EPToast from '../components/ui/EPToast.vue'
import { useEponymeAuth } from '../composables/useEponymeAuth'
import { useEponymeConfig } from '../composables/useEponymeConfig'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import type { EponymeExportFile, EponymeImportResult } from '../server/services/eponyme-store'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../utils/get-eponyme-schemas'

const config = useEponymeConfig()
const route = useRoute()
const auth = useEponymeAuth()
const request = useRequestFetch()
const eponymes = getEponymeSchemas(config)
const collections = getEponymeCollections(config)
const forms = getEponymeForms(config)
const entries = { ...eponymes, ...collections, ...forms }

useEponymeFavicon()
useSeoMeta({ title: 'Eponyme' })

const fileInput = ref<HTMLInputElement>()
const exporting = ref(false)
const importing = ref(false)
const preview = ref<EponymeImportResult>()
const pendingFile = ref<EponymeExportFile>()
const toast = ref<{
  open: boolean
  title: string
  description: string
  variant: 'success' | 'error'
}>({ open: false, title: '', description: '', variant: 'success' })

function label(name: string) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

/** Closing then reopening lets two consecutive toasts animate instead of merging. */
async function showToast(variant: 'success' | 'error', title: string, description: string) {
  toast.value.open = false
  await nextTick()
  toast.value = { open: true, variant, title, description }
}

/** An import refusal names the entries whose schema diverged, which is the whole point of the check. */
function describeError(caught: unknown, fallback: string) {
  const error = caught as FetchError<{ statusMessage?: string, data?: { schemaMismatch?: string[] } }>
  const mismatch = error?.data?.data?.schemaMismatch
  const message = error?.statusMessage || error?.data?.statusMessage || fallback
  return mismatch?.length ? `${message} (${mismatch.join(', ')})` : message
}

async function exportContent() {
  exporting.value = true
  try {
    const file = await request<EponymeExportFile>('/api/eponyme-export', { cache: 'no-store' })
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `eponyme-export-${file.eponyme.exportedAt.slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  catch (caught) {
    await showToast('error', 'Export failed', describeError(caught, 'Unable to export the content.'))
  }
  finally {
    exporting.value = false
  }
}

/** Reads the chosen file and asks the server what the import would do, without writing. */
async function reviewFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // The same file must be selectable twice in a row, so the input is reset either way.
  input.value = ''
  if (!file) return

  importing.value = true
  try {
    const parsed = JSON.parse(await file.text()) as EponymeExportFile
    preview.value = await request<EponymeImportResult>('/api/eponyme-import?dryRun=1', { method: 'POST', body: parsed })
    pendingFile.value = parsed
  }
  catch (caught) {
    pendingFile.value = undefined
    preview.value = undefined
    await showToast('error', 'Import refused', caught instanceof SyntaxError
      ? 'This file is not valid JSON.'
      : describeError(caught, 'Unable to read this export file.'))
  }
  finally {
    importing.value = false
  }
}

async function confirmImport() {
  if (!pendingFile.value) return
  importing.value = true
  try {
    const result = await request<EponymeImportResult>('/api/eponyme-import', { method: 'POST', body: pendingFile.value })
    closePreview()
    // The sidebar reads the publication statuses, which the import just changed.
    await refreshNuxtData()
    await showToast(
      'success',
      'Content imported',
      `${result.created} created, ${result.updated} updated${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}.`,
    )
  }
  catch (caught) {
    await showToast('error', 'Import failed', describeError(caught, 'Unable to import this file.'))
  }
  finally {
    importing.value = false
  }
}

function closePreview() {
  preview.value = undefined
  pendingFile.value = undefined
}
</script>

<template>
  <main class="eponyme-root ep:flex ep:min-h-screen ep:flex-col ep:bg-theme-ep ep:font-sans ep:text-text-ep ep:md:flex-row">
    <EponymeSidebar :base-path="route.path" />
    <section class="ep:mx-auto ep:w-full ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
      <div class="ep:flex ep:flex-wrap ep:items-start ep:justify-between ep:gap-4">
        <div>
          <p class="ep:m-0 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
            Eponyme
          </p>
          <h1 class="ep:mt-2 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white">
            Content entries
          </h1>
          <p class="ep:mt-2 ep:text-sm ep:text-muted-ep">
            Choose the content area you want to update.
          </p>
        </div>
        <div
          v-if="auth.canEdit.value"
          class="ep:flex ep:shrink-0 ep:items-center ep:gap-2"
        >
          <EPButton
            label="Export"
            icon="mingcute:download-2-line"
            size="sm"
            :loading="exporting"
            :disabled="exporting"
            title="Download every entry as a JSON file"
            @click="exportContent"
          />
          <EPButton
            v-if="auth.isOwner.value"
            label="Import"
            icon="mingcute:upload-2-line"
            size="sm"
            :loading="importing"
            :disabled="importing"
            title="Apply an export file from another environment"
            @click="fileInput?.click()"
          />
          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            class="ep:hidden"
            @change="reviewFile"
          >
        </div>
      </div>
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
    <ClientOnly>
      <EPDialog
        :open="Boolean(preview)"
        title="Import content"
        description="Entries in the file overwrite their counterpart. Nothing is ever deleted."
        @update:open="!$event && closePreview()"
      >
        <div v-if="preview">
          <ul class="ep:m-0 ep:list-none ep:space-y-1 ep:p-0 ep:text-sm ep:text-muted-ep">
            <li><span class="ep:font-semibold ep:text-white">{{ preview.created }}</span> to create</li>
            <li><span class="ep:font-semibold ep:text-white">{{ preview.updated }}</span> to overwrite</li>
            <li><span class="ep:font-semibold ep:text-white">{{ preview.skipped.length }}</span> skipped</li>
          </ul>
          <ul
            v-if="preview.skipped.length"
            class="ep:mt-4 ep:max-h-40 ep:list-none ep:space-y-2 ep:overflow-y-auto ep:p-0 ep:text-xs ep:text-muted-ep"
          >
            <li
              v-for="skipped in preview.skipped"
              :key="skipped.name"
            >
              <span class="ep:font-medium ep:text-white">{{ skipped.name }}</span> — {{ skipped.reason }}
            </li>
          </ul>
          <div class="ep:mt-6 ep:flex ep:justify-end ep:gap-2">
            <EPButton
              label="Cancel"
              variant="ghost"
              @click="closePreview"
            />
            <EPButton
              label="Import"
              variant="primary"
              :loading="importing"
              :disabled="importing || (!preview.created && !preview.updated)"
              @click="confirmImport"
            />
          </div>
        </div>
      </EPDialog>
      <EPToast
        :open="toast.open"
        :title="toast.title"
        :description="toast.description"
        :variant="toast.variant"
        @update:open="toast.open = $event"
      />
    </ClientOnly>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
}
</style>
