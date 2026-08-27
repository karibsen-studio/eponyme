<script setup lang="ts">
import { t } from '#eponyme/locale'
import { createError, useSeoMeta } from '#app'
import { computed, onMounted, ref } from 'vue'
import EponymeMediaGrid from '../components/media/EponymeMediaGrid.vue'
import EponymeMediaUploader from '../components/media/EponymeMediaUploader.vue'
import EPAlertDialog from '../components/ui/EPAlertDialog.vue'
import EPInputText from '../components/ui/EPInputText.vue'
import EPToast from '../components/ui/EPToast.vue'
import { useEponymeAuth } from '../composables/useEponymeAuth'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import { formatEponymeBytes, useEponymeMedia } from '../composables/useEponymeMedia'
import type { EponymeMediaItem } from '../types/storage'
import { getEponymeErrorMessage } from '../utils/eponyme-error'
import '../assets/dashboard.css'

useEponymeFavicon()
useSeoMeta({ title: t('library.title') })

const auth = useEponymeAuth()
const mediaResource = { kind: 'system' as const, name: 'media' }
if (!auth.can('media.read', mediaResource))
  throw createError({ status: 403, message: t('server.forbidden') })
const canUpload = computed(() => auth.can('media.upload', mediaResource))
const canDelete = computed(() => auth.can('media.delete', mediaResource))
const { items, pending, error, hasMore, refresh, loadMore, upload, remove } = useEponymeMedia()
const query = ref('')
const deleteTarget = ref<EponymeMediaItem>()
const deletePending = ref(false)
const toast = ref({ open: false, title: '', variant: 'success' as 'success' | 'error' })

onMounted(() => void refresh())

function notify(title: string, variant: 'success' | 'error' = 'success') {
  toast.value = { open: true, title, variant }
}

async function copyUrl(item: EponymeMediaItem) {
  try {
    await navigator.clipboard.writeText(new URL(item.url, window.location.origin).toString())
    notify(t('library.copied'))
  }
  catch {
    notify(t('library.uploadFailed'), 'error')
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deletePending.value) return
  deletePending.value = true
  try {
    await remove(target.key)
    deleteTarget.value = undefined
    notify(t('library.deleted'))
  }
  catch (cause) {
    notify(getEponymeErrorMessage(cause, t('library.uploadFailed')), 'error')
  }
  finally {
    deletePending.value = false
  }
}

function fileName(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1)
}
</script>

<template>
  <div class="ep:contents">
    <section class="ep:mx-auto ep:w-full ep:max-w-5xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
      <header class="ep:flex ep:flex-wrap ep:items-end ep:justify-between ep:gap-4">
        <div>
          <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
            {{ t('library.title') }}
          </h1>
          <p class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-text-muted">
            {{ t('library.description') }}
          </p>
        </div>
        <EponymeMediaUploader
          v-if="canUpload"
          variant="primary"
          :upload="upload"
          @error="notify($event, 'error')"
          @uploaded="notify(t('library.copied'))"
        />
      </header>

      <div class="ep:mt-6 ep:flex ep:items-center ep:gap-2">
        <EPInputText
          v-model="query"
          type="search"
          size="sm"
          :placeholder="t('library.search')"
          :aria-label="t('library.search')"
        />
      </div>

      <p
        v-if="error"
        role="alert"
        class="ep:mt-6 ep:rounded-xl ep:bg-danger/10 ep:p-4 ep:text-sm ep:text-danger"
      >
        {{ error }}
      </p>

      <div class="ep:mt-6">
        <EponymeMediaGrid
          :items="items"
          :pending="pending"
          :query="query"
          :has-more="hasMore"
          :deletable="canDelete"
          @select="copyUrl"
          @remove="deleteTarget = $event"
          @load-more="loadMore"
        />
      </div>
    </section>

    <ClientOnly>
      <EPAlertDialog
        :open="Boolean(deleteTarget)"
        :label="t('library.deleteTitle')"
        :description="deleteTarget ? t('library.deleteMessage', { name: fileName(deleteTarget.key) }) : ''"
        :confirm-label="t('library.delete')"
        confirm-variant="danger"
        :confirm-loading="deletePending"
        :close-on-confirm="false"
        @cancel="deleteTarget = undefined"
        @update:open="!$event && (deleteTarget = undefined)"
        @confirm="confirmDelete"
      >
        <div
          v-if="deleteTarget"
          class="ep:flex ep:items-center ep:gap-3 ep:rounded-xl ep:border ep:border-border-default ep:p-3"
        >
          <img
            v-if="deleteTarget.contentType.startsWith('image/')"
            :src="deleteTarget.url"
            :alt="fileName(deleteTarget.key)"
            class="ep:h-14 ep:w-14 ep:shrink-0 ep:rounded-lg ep:object-cover"
          >
          <Icon
            v-else
            name="mingcute:file-line"
            size="24"
            aria-hidden="true"
            class="ep:shrink-0 ep:text-text-muted"
          />
          <div class="ep:min-w-0">
            <p class="ep:m-0 ep:truncate ep:text-sm ep:font-medium ep:text-text-strong">
              {{ fileName(deleteTarget.key) }}
            </p>
            <p class="ep:mt-0.5 ep:mb-0 ep:text-[11px] ep:text-text-muted">
              {{ formatEponymeBytes(deleteTarget.size) }} · {{ deleteTarget.key }}
            </p>
          </div>
        </div>
      </EPAlertDialog>
      <EPToast
        :open="toast.open"
        :title="toast.title"
        :variant="toast.variant"
        @update:open="toast.open = $event"
      />
    </ClientOnly>
  </div>
</template>
