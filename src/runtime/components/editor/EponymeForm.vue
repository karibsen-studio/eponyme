<script setup lang="ts">
import { useRouter, useRuntimeConfig, useState } from '#app'
import { onKeyStroke, useEventListener } from '@vueuse/core'
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import EponymeHistoryDialog from './EponymeHistoryDialog.vue'
import EponymePreviewPanel from './EponymePreviewPanel.vue'
import ArrayField from '../fields/ArrayField.vue'
import SectionField from '../fields/SectionField.vue'
import TabsField from '../fields/TabsField.vue'
import FieldRenderer from '../fields/FieldRenderer.vue'
import EPBadge from '../ui/EPBadge.vue'
import EPButton from '../ui/EPButton.vue'
import EPTooltip from '../ui/EPTooltip.vue'
import EPToast from '../ui/EPToast.vue'
import { useEponyme } from '../../composables/useEponyme'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import { useEponymeConfig } from '../../composables/useEponymeConfig'
import { useEponymeValidation } from '../../composables/useEponymeValidation'
import type { EponymeSchema } from '../../types'
import type { EponymeStatus } from '../../server/services/eponyme-store'
import { getEponymeCollections } from '../../utils/get-eponyme-schemas'
import { isFieldVisible } from '../../utils/is-field-visible'
import { resolvePreviewPath } from '../../utils/preview'
import { childErrors, errorsAt, fieldPathId } from '../../utils/field-path'

const props = withDefaults(defineProps<{ name: string, schema: EponymeSchema, readonlyFields?: string[] }>(), { readonlyFields: () => [] })
const runtimeConfig = useRuntimeConfig()
const previewPaths = (runtimeConfig.public.eponyme as { previewPaths?: Record<string, string> } | undefined)?.previewPaths ?? {}
// Collection entries are named `<collection>/<slug>`, so the preview path comes
// from the collection's `:slug` pattern rather than an exact key match.
const collectionNames = Object.keys(getEponymeCollections(useEponymeConfig()))
const previewPath = computed(() => resolvePreviewPath(previewPaths, collectionNames, props.name))
const auth = useEponymeAuth()
const { data: eponymeData, errors: serverErrors, pending, status, publishedAt, refresh, save: persist } = useEponyme(props.name as never, { version: 'draft', raw: true })
const data = ref<Record<string, unknown>>({})
const savedData = ref<Record<string, unknown>>({})
// Same rules as the server, run locally while typing, keyed by field path.
const validation = useEponymeValidation(props.schema, data, savedData, { serverErrors })
const errors = validation.errors
const dirty = computed(() => JSON.stringify(data.value) !== JSON.stringify(savedData.value))
const historyOpen = ref(false)
const previewOpen = ref(false)
const previewPanel = ref<{ reload: () => void }>()
const entryStatuses = useState<Record<string, EponymeStatus>>('eponyme:entry-statuses', () => ({}))
const publicationStatus = computed(() => status.value === 'draft' ? 'draft' : publishedAt.value ? 'published' : 'unpublished')
const publicationBadgeVariant = computed<'neutral' | 'success' | 'warning'>(() => {
  if (publicationStatus.value === 'published') return 'success'
  if (publicationStatus.value === 'draft') return 'warning'
  return 'neutral'
})
const toast = ref<{
  open: boolean
  title: string
  description: string
  variant: 'success' | 'error'
}>({
  open: false,
  title: '',
  description: '',
  variant: 'success',
})

function label(name: string, configured?: string) {
  return configured || name.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

/** Applies to every field type, including the ones nested in sections, tabs and arrays. */
function fieldDisabled(fieldName: string) {
  return !auth.canEdit.value || props.readonlyFields.includes(fieldName)
}

watch(eponymeData, (value) => {
  if (value) {
    const next = cloneData(value as Record<string, unknown>)
    data.value = next
    savedData.value = cloneData(next)
  }
}, { immediate: true })

watch(status, (value) => {
  entryStatuses.value = { ...entryStatuses.value, [props.name]: value }
}, { immediate: true })

function cloneData(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

async function showToast(
  variant: 'success' | 'error',
  title: string,
  description: string,
) {
  toast.value.open = false
  await nextTick()
  toast.value = { open: true, variant, title, description }
}

async function save(action: 'draft' | 'publish' = 'draft') {
  if (!auth.canEdit.value) return
  // Publishing runs the full rules locally first, so an incomplete entry is reported
  // instantly and every message is revealed instead of only the touched fields.
  if (action === 'publish' && !validation.validateForPublish()) {
    await showToast('error', 'Some fields need attention', 'Review the highlighted fields, then try again.')
    return
  }
  try {
    const response = await persist(data.value as never, action)
    if (response) {
      savedData.value = cloneData(response as Record<string, unknown>)
      validation.reset()
      // The iframe serves persisted content, so it only becomes accurate once we save.
      previewPanel.value?.reload()
      await showToast(
        'success',
        action === 'publish' ? 'Changes published' : 'Draft saved',
        action === 'publish' ? 'The public content is now up to date.' : 'Your changes are saved but not public yet.',
      )
    }
  }
  catch (error) {
    const hasValidationErrors = Object.keys(errors.value).length > 0
    if ((error as { statusCode?: number }).statusCode === 409) {
      await showToast(
        'error',
        'Someone else saved first',
        'This entry changed while you were editing. Reload the page to get the latest version.',
      )
      return
    }
    await showToast(
      'error',
      hasValidationErrors ? 'Some fields need attention' : action === 'publish' ? 'Unable to publish' : 'Unable to save draft',
      hasValidationErrors
        ? 'Review the highlighted fields, then try again.'
        : 'An unexpected error occurred. Please try again.',
    )
  }
}

async function handleVersionRestored() {
  await refresh()
  await showToast('success', 'Version restored', 'The selected version is now the current draft.')
}

onKeyStroke('s', (event) => {
  if (!auth.canEdit.value || event.repeat || (!event.metaKey && !event.ctrlKey) || pending.value) return
  event.preventDefault()
  void save('draft')
})

const removeNavigationGuard = useRouter().beforeEach(() => {
  if (auth.canEdit.value && dirty.value && !confirm('You have unsaved changes. Leave this page anyway?')) return false
})

onScopeDispose(removeNavigationGuard)

useEventListener('beforeunload', (event) => {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
})
</script>

<template>
  <section class="eponyme-form ep:mx-auto ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <div class="ep:group ep:mt-2 ep:mb-8 ep:flex ep:flex-wrap ep:items-center ep:gap-3">
      <h1 class="ep:m-0 ep:min-w-0 ep:max-w-full ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white ep:[overflow-wrap:anywhere]">
        {{ label(name.split('/').at(-1) ?? name) }}
      </h1>
      <EPBadge :variant="publicationBadgeVariant">
        {{ publicationStatus }}
      </EPBadge>
      <EPBadge
        v-if="dirty"
        variant="danger"
      >
        Unsaved
      </EPBadge>
      <EPTooltip content="History">
        <EPButton
          class="ep:opacity-0 ep:focus-visible:opacity-100 ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-white/30 ep:group-hover:opacity-100"
          icon="mingcute:history-anticlockwise-line"
          variant="ghost"
          aria-label="Open history"
          @click="historyOpen = true"
        />
      </EPTooltip>
    </div>
    <p
      v-if="!eponymeData"
      class="ep:text-sm ep:text-muted-ep"
    >
      Loading…
    </p>
    <!-- The schema rules are the single source of truth; native bubbles would preempt them
         with browser-locale messages and block the publish handler entirely. -->
    <form
      v-else
      novalidate
      @submit.prevent="save('publish')"
    >
      <div
        class="ep:m-0 ep:min-w-0 ep:border-0 ep:p-0"
      >
        <template
          v-for="(field, fieldName) in schema"
          :key="fieldName"
        >
          <div
            v-if="isFieldVisible(field.options, data)"
            class="ep:mb-6"
          >
            <SectionField
              v-if="field.type === 'section'"
              v-model="data[fieldName]"
              :field-name="fieldName"
              :definition="field"
              :errors="childErrors(errors, fieldName)"
              :disabled="fieldDisabled(fieldName)"
            />
            <TabsField
              v-else-if="field.type === 'tabs'"
              v-model="data[fieldName]"
              :field-name="fieldName"
              :definition="field"
              :errors="childErrors(errors, fieldName)"
              :disabled="fieldDisabled(fieldName)"
            />
            <template v-else-if="field.type === 'array'">
              <label
                :for="fieldPathId(fieldName)"
                class="ep:mb-1.5 ep:block ep:text-sm ep:font-medium ep:text-text-ep"
              >
                {{ label(fieldName, field.options.label) }}<span
                  v-if="field.options.required"
                  class="ep:text-danger-ep"
                > *</span>
              </label>
              <p
                v-if="field.options.description"
                class="ep:mt-0 ep:mb-2 ep:text-xs ep:leading-relaxed ep:text-muted-ep"
              >
                {{ field.options.description }}
              </p>
              <ArrayField
                v-model="data[fieldName]"
                :field-name="fieldName"
                :definition="field"
                :errors="childErrors(errors, fieldName)"
                :disabled="fieldDisabled(fieldName)"
              />
              <p
                v-for="error in errorsAt(errors, fieldName)"
                :key="error"
                role="alert"
                class="ep:mt-1.5 ep:text-xs ep:text-danger-ep"
              >
                {{ error }}
              </p>
            </template>
            <FieldRenderer
              v-else
              v-model="data[fieldName]"
              :field-name="fieldName"
              :field="field"
              :errors="errorsAt(errors, fieldName)"
              :disabled="fieldDisabled(fieldName)"
            />
          </div>
        </template>
      </div>
      <p
        v-if="errors._form"
        class="ep:mt-1 ep:text-xs ep:text-danger-ep"
      >
        {{ errors._form.join(' ') }}
      </p>
      <div class="ep:sticky ep:bottom-4 ep:z-20 ep:mt-8 ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3 ep:rounded-xl ep:bg-theme-ep/70 ep:p-3 ep:backdrop-blur-xl">
        <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
          <EPButton
            v-if="auth.canEdit.value"
            type="submit"
            size="sm"
            variant="primary"
            :disabled="pending"
            :loading="pending"
          >
            {{ pending ? 'Publishing…' : 'Publish' }}
          </EPButton>
          <EPButton
            v-if="auth.canEdit.value"
            size="sm"
            :disabled="pending"
            title="Save draft (Ctrl/Command + S)"
            @click="save('draft')"
          >
            {{ pending ? 'Saving…' : 'Save draft' }}
          </EPButton>
        </div>
        <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
          <EPButton
            v-if="previewPath"
            size="sm"
            variant="ghost"
            icon="mingcute:eye-2-line"
            :disabled="pending"
            @click="previewOpen = !previewOpen"
          >
            {{ previewOpen ? 'Hide preview' : 'Preview' }}
          </EPButton>
        </div>
      </div>
    </form>
    <ClientOnly>
      <EponymePreviewPanel
        v-if="previewPath"
        ref="previewPanel"
        :open="previewOpen"
        :name="name"
        :path="previewPath"
        @update:open="previewOpen = $event"
      />
      <EponymeHistoryDialog
        :open="historyOpen"
        :name="name"
        :can-restore="auth.canEdit.value"
        @update:open="historyOpen = $event"
        @restored="handleVersionRestored"
      />
      <EPToast
        :open="toast.open"
        :title="toast.title"
        :description="toast.description"
        :variant="toast.variant"
        @update:open="toast.open = $event"
      />
    </ClientOnly>
  </section>
</template>
