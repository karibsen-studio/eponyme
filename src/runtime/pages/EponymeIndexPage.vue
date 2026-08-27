<script setup lang="ts">
import { t } from '#eponyme/locale'
import { computed, nextTick, ref } from 'vue'
import { refreshNuxtData, useRequestFetch, useRoute, useSeoMeta } from '#app'
import EponymeNavigationLink from '../components/editor/EponymeNavigationLink.vue'
import EPButton from '../components/ui/EPButton.vue'
import EPDialog from '../components/ui/EPDialog.vue'
import EPToast from '../components/ui/EPToast.vue'
import { useEponymeAuth } from '../composables/useEponymeAuth'
import { useEponymeConfig } from '../composables/useEponymeConfig'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import type { EponymeExportFile, EponymeImportResult } from '../server/services/eponyme-store'
import { getEponymeErrorBody } from '../utils/eponyme-error'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from '../utils/get-eponyme-schemas'
import { humanizeLabel } from '../utils/humanize-label'
import '../assets/dashboard.css'

const config = useEponymeConfig()
const route = useRoute()
const auth = useEponymeAuth()
const request = useRequestFetch()
const eponymes = getEponymeSchemas(config)
const collections = getEponymeCollections(config)
const forms = getEponymeForms(config)
const entries = computed(() => Object.fromEntries([
  ...Object.entries(eponymes).filter(([name]) => auth.can('content.read', { kind: 'singleton', name })),
  ...Object.entries(collections).filter(([name]) => auth.can('content.read', { kind: 'collection', name })),
  ...Object.entries(forms).filter(([name]) => auth.can('submissions.read', { kind: 'form', name })),
]))
const contentSystem = { kind: 'system' as const, name: 'content' }
const canExport = computed(() => auth.can('content.export', contentSystem))
const canImport = computed(() => auth.can('content.import', contentSystem))

useEponymeFavicon()
useSeoMeta({ title: t('index.title') })

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
  return humanizeLabel(name)
}

/** Closing then reopening lets two consecutive toasts animate instead of merging. */
async function showToast(variant: 'success' | 'error', title: string, description: string) {
  toast.value.open = false
  await nextTick()
  toast.value = { open: true, variant, title, description }
}

/** An import refusal names the entries whose schema diverged, which is the whole point of the check. */
function describeError(caught: unknown, fallback: string) {
  const error = getEponymeErrorBody<{ data?: { schemaMismatch?: string[] } }>(caught)
  const mismatch = error?.data?.schemaMismatch
  const message = error?.message || fallback
  return mismatch?.length ? t('index.mismatch', { message, entries: mismatch.join(', ') }) : message
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
    await showToast('error', t('index.exportFailed'), describeError(caught, t('index.exportFailedBody')))
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
    await showToast('error', t('index.importRefused'), caught instanceof SyntaxError
      ? t('index.importInvalidJson')
      : describeError(caught, t('index.importUnreadable')))
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
      t('index.imported'),
      result.skipped.length
        ? t('index.importedBodySkipped', { created: result.created, updated: result.updated, skipped: result.skipped.length })
        : t('index.importedBody', { created: result.created, updated: result.updated }),
    )
  }
  catch (caught) {
    await showToast('error', t('index.importFailed'), describeError(caught, t('index.importFailedBody')))
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
  <div class="ep:contents">
    <section class="ep:mx-auto ep:w-full ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
      <div class="ep:flex ep:flex-wrap ep:items-start ep:justify-between ep:gap-4">
        <div>
          <h1 class="ep:mt-2 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
            {{ t('index.heading') }}
          </h1>
          <p class="ep:mt-2 ep:text-sm ep:text-text-muted">
            {{ t('index.subheading') }}
          </p>
        </div>
        <div
          v-if="canExport || canImport"
          class="ep:flex ep:shrink-0 ep:items-center ep:gap-2"
        >
          <EPButton
            v-if="canExport"
            :label="t('action.export')"
            icon="mingcute:download-2-line"
            size="sm"
            :loading="exporting"
            :disabled="exporting"
            :title="t('index.exportTitle')"
            @click="exportContent"
          />
          <EPButton
            v-if="canImport"
            :label="t('action.import')"
            icon="mingcute:upload-2-line"
            size="sm"
            :loading="importing"
            :disabled="importing"
            :title="t('index.importTitle')"
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
        :aria-label="t('index.heading')"
      >
        <EponymeNavigationLink
          v-for="(_, name) in entries"
          :key="name"
          :to="`${route.path.replace(/\/$/, '')}/${name}`"
          :label="label(String(name).split('/').at(-1) ?? String(name))"
          :description="collections[name] ? t('kind.collection') : forms[name] ? t('kind.form') : undefined"
          variant="card"
        />
      </nav>
    </section>
    <ClientOnly>
      <EPDialog
        :open="Boolean(preview)"
        :title="t('index.importDialog')"
        :description="t('index.importDialogDescription')"
        @update:open="!$event && closePreview()"
      >
        <div v-if="preview">
          <ul class="ep:m-0 ep:list-none ep:space-y-1 ep:p-0 ep:text-sm ep:text-text-muted">
            <li><span class="ep:font-semibold ep:text-text-strong">{{ preview.created }}</span> {{ t('index.toCreate') }}</li>
            <li><span class="ep:font-semibold ep:text-text-strong">{{ preview.updated }}</span> {{ t('index.toOverwrite') }}</li>
            <li><span class="ep:font-semibold ep:text-text-strong">{{ preview.skipped.length }}</span> {{ t('index.skipped') }}</li>
          </ul>
          <ul
            v-if="preview.skipped.length"
            class="ep:mt-4 ep:max-h-40 ep:list-none ep:space-y-2 ep:overflow-y-auto ep:p-0 ep:text-xs ep:text-text-muted"
          >
            <li
              v-for="skipped in preview.skipped"
              :key="skipped.name"
            >
              <span class="ep:font-medium ep:text-text-strong">{{ skipped.name }}</span>: {{ skipped.reason }}
            </li>
          </ul>
          <div class="ep:mt-6 ep:flex ep:justify-end ep:gap-2">
            <EPButton
              :label="t('action.cancel')"
              variant="ghost"
              @click="closePreview"
            />
            <EPButton
              :label="t('action.import')"
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
  </div>
</template>
