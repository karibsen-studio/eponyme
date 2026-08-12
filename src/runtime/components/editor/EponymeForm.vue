<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useRouter, useRuntimeConfig, useState } from '#app'
import { onKeyStroke, useEventListener } from '@vueuse/core'
import { computed, nextTick, onScopeDispose, ref, useId, watch } from 'vue'
import EponymeHistoryDialog from './EponymeHistoryDialog.vue'
import EponymePreviewPanel from './EponymePreviewPanel.vue'
import { LazyArrayField } from '../fields/lazy'
import SectionField from '../fields/SectionField.vue'
import TabsField from '../fields/TabsField.vue'
import FieldRenderer from '../fields/FieldRenderer.vue'
import EPBadge from '../ui/EPBadge.vue'
import EPButton from '../ui/EPButton.vue'
import EPInputText from '../ui/EPInputText.vue'
import EPTooltip from '../ui/EPTooltip.vue'
import EPToast from '../ui/EPToast.vue'
import { useEponyme } from '../../composables/useEponyme'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import { useEponymeConfig } from '../../composables/useEponymeConfig'
import { useEponymeValidation } from '../../composables/useEponymeValidation'
import type { EponymeSchema } from '../../types'
import type { EponymeAction, EponymeSchedule, EponymeStatus } from '../../server/services/eponyme-store'
import { getEponymeCollections } from '../../utils/get-eponyme-schemas'
import { isFieldVisible } from '../../utils/is-field-visible'
import { resolvePreviewPath, splitCollectionEntry } from '../../utils/preview'
import { isEponymePublicationEnabled } from '../../utils/eponyme-publication'
import type { EponymePublicationOption } from '../../utils/eponyme-publication'
import { childErrors, errorsAt, fieldPathId } from '../../utils/field-path'
import { EPONYME_DATE_LOCALE } from '../../utils/date-locale'
import { humanizeLabel } from '../../utils/humanize-label'

const props = withDefaults(defineProps<{ name: string, schema: EponymeSchema, readonlyFields?: string[] }>(), { readonlyFields: () => [] })
const runtimeConfig = useRuntimeConfig()
const eponymeOptions = runtimeConfig.public.eponyme as { previewPaths?: Record<string, string>, publication?: EponymePublicationOption } | undefined
const previewPaths = eponymeOptions?.previewPaths ?? {}
// Collection entries are named `<collection>/<slug>`, so the preview path comes
// from the collection's `:slug` pattern rather than an exact key match.
const collections = getEponymeCollections(useEponymeConfig())
const collectionNames = Object.keys(collections)
const previewPath = computed(() => resolvePreviewPath(previewPaths, collectionNames, props.name))
const publicationEnabled = computed(() => {
  const entry = splitCollectionEntry(collectionNames, props.name)
  return isEponymePublicationEnabled(
    eponymeOptions?.publication,
    props.name,
    entry && { name: entry.collection, publication: collections[entry.collection]?.publication },
  )
})
const auth = useEponymeAuth()
const {
  data: eponymeData,
  errors: serverErrors,
  pending,
  status,
  publishedAt,
  scheduledPublishAt,
  scheduledUnpublishAt,
  refresh,
  save: persist,
} = useEponyme(props.name as never, { version: 'draft', raw: true })
const data = ref<Record<string, unknown>>({})
const savedData = ref<Record<string, unknown>>({})
// Same rules as the server, run locally while typing, keyed by field path.
const validation = useEponymeValidation(props.schema, data, savedData, { serverErrors })
const errors = validation.errors
const contentDirty = computed(() => JSON.stringify(data.value) !== JSON.stringify(savedData.value))
const historyOpen = ref(false)
const activePanel = ref<'content' | 'publication'>('content')
const editorTabsId = useId()
const contentTabId = `${editorTabsId}-content-tab`
const contentPanelId = `${editorTabsId}-content-panel`
const publicationTabId = `${editorTabsId}-publication-tab`
const publicationPanelId = `${editorTabsId}-publication-panel`
const schedulePublishValue = ref('')
const scheduleUnpublishValue = ref('')
const schedulePublishId = useId()
const scheduleUnpublishId = useId()
const scheduleHintId = useId()
const scheduleErrorId = useId()
const scheduleError = ref('')
const previewOpen = ref(false)
const previewPanel = ref<{ reload: () => void }>()
const entryStatuses = useState<Record<string, EponymeStatus>>('eponyme:entry-statuses', () => ({}))
const hasSchedule = computed(() => Boolean(scheduledPublishAt.value || scheduledUnpublishAt.value))
const scheduleDirty = computed(() => schedulePublishValue.value !== toLocalDateTime(scheduledPublishAt.value)
  || scheduleUnpublishValue.value !== toLocalDateTime(scheduledUnpublishAt.value))
const dirty = computed(() => contentDirty.value || scheduleDirty.value)
const publicationStatus = computed<'draft' | 'published' | 'unpublished' | 'scheduled'>(() => hasSchedule.value ? 'scheduled' : status.value)
const mainAction = computed<EponymeAction>(() => publicationEnabled.value && hasSchedule.value ? 'schedule' : 'publish')
const primaryActionLabel = computed(() => {
  if (pending.value) return t('form.saving')
  if (activePanel.value === 'publication' && scheduleDirty.value) return t('form.schedule')
  return status.value === 'published' || hasSchedule.value ? t('form.save') : t('form.publish')
})
const publicationBadgeVariant = computed<'neutral' | 'success' | 'warning'>(() => {
  if (publicationStatus.value === 'scheduled') return 'warning'
  if (publicationStatus.value === 'published') return 'success'
  if (publicationStatus.value === 'draft') return 'warning'
  return 'neutral'
})
const publicationLabel = computed(() => {
  const base = t(`status.${publicationStatus.value}`)
  return base
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
  return humanizeLabel(name, configured)
}

/** Applies to every field type, including the ones nested in sections, tabs and arrays. */
function fieldDisabled(fieldName: string) {
  return !auth.canEdit.value || props.readonlyFields.includes(fieldName)
}

// `flush: 'sync'` is what makes the server render the real values: during SSR the
// fetch resolves after setup, and Vue never flushes queued watchers there, so a
// default watcher would leave the form empty in the HTML and mismatch on hydration.
watch(eponymeData, (value) => {
  if (value) {
    const next = cloneData(value as Record<string, unknown>)
    data.value = next
    savedData.value = cloneData(next)
  }
}, { immediate: true, flush: 'sync' })

watch(status, (value) => {
  entryStatuses.value = { ...entryStatuses.value, [props.name]: value }
}, { immediate: true, flush: 'sync' })

watch([scheduledPublishAt, scheduledUnpublishAt], ([publishAt, unpublishAt]) => {
  schedulePublishValue.value = toLocalDateTime(publishAt)
  scheduleUnpublishValue.value = toLocalDateTime(unpublishAt)
  scheduleError.value = ''
}, { immediate: true, flush: 'sync' })

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

async function save(action: EponymeAction = 'draft', schedule: EponymeSchedule = {}) {
  if (!auth.canEdit.value || pending.value) return false
  // Publishing runs the full rules locally first, so an incomplete entry is reported
  // instantly and every message is revealed instead of only the touched fields.
  if ((action === 'publish' || action === 'schedule') && !validation.validateForPublish()) {
    activePanel.value = 'content'
    await showToast('error', t('form.invalidTitle'), t('form.invalidBody'))
    return false
  }
  try {
    const response = await persist(data.value as never, action, schedule)
    if (response) {
      savedData.value = cloneData(response as Record<string, unknown>)
      validation.reset()
      // The iframe serves persisted content, so it only becomes accurate once we save.
      previewPanel.value?.reload()
      await showToast(
        'success',
        t(actionToast[action].title),
        t(actionToast[action].body),
      )
      return true
    }
  }
  catch (error) {
    const hasValidationErrors = Object.keys(errors.value).length > 0
    if ((error as { statusCode?: number }).statusCode === 409) {
      await showToast(
        'error',
        t('form.conflictTitle'),
        t('form.conflictBody'),
      )
      return false
    }
    await showToast(
      'error',
      hasValidationErrors ? t('form.invalidTitle') : t(actionToast[action].failed),
      hasValidationErrors
        ? t('form.invalidBody')
        : t('form.unexpected'),
    )
    return false
  }
  return false
}

const actionToast = {
  draft: { title: 'form.draftTitle', body: 'form.draftBody', failed: 'form.draftFailed' },
  publish: { title: 'form.publishedTitle', body: 'form.publishedBody', failed: 'form.publishFailed' },
  unpublish: { title: 'form.unpublishedTitle', body: 'form.unpublishedBody', failed: 'form.unpublishFailed' },
  revertToDraft: { title: 'form.revertedTitle', body: 'form.revertedBody', failed: 'form.revertToDraftFailed' },
  schedule: { title: 'form.scheduledTitle', body: 'form.scheduledBody', failed: 'form.scheduleFailed' },
  unschedule: { title: 'form.unscheduledTitle', body: 'form.unscheduledBody', failed: 'form.unscheduleFailed' },
} as const

function formatDate(value: string) {
  return new Intl.DateTimeFormat(EPONYME_DATE_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function toLocalDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resetScheduleFields() {
  schedulePublishValue.value = toLocalDateTime(scheduledPublishAt.value)
  scheduleUnpublishValue.value = toLocalDateTime(scheduledUnpublishAt.value)
  scheduleError.value = ''
}

function currentSchedule(): EponymeSchedule {
  return {
    scheduledPublishAt: scheduledPublishAt.value,
    scheduledUnpublishAt: scheduledUnpublishAt.value,
  }
}

async function submitSchedule() {
  if (pending.value || !auth.canEdit.value) return
  const schedule = {
    scheduledPublishAt: schedulePublishValue.value ? new Date(schedulePublishValue.value).toISOString() : null,
    scheduledUnpublishAt: scheduleUnpublishValue.value ? new Date(scheduleUnpublishValue.value).toISOString() : null,
  }
  if (!schedule.scheduledPublishAt && !schedule.scheduledUnpublishAt) {
    scheduleError.value = t('server.invalidSchedule')
    document.getElementById(schedulePublishId)?.focus()
    return
  }
  scheduleError.value = ''
  await save('schedule', schedule)
}

async function submitPrimary() {
  if (activePanel.value === 'publication' && scheduleDirty.value) {
    await submitSchedule()
    return
  }
  await save(mainAction.value, mainAction.value === 'schedule' ? currentSchedule() : {})
}

function activatePanel(panel: 'content' | 'publication') {
  activePanel.value = panel
}

function focusPanel(offset: number) {
  const panels = ['content', 'publication'] as const
  const index = panels.indexOf(activePanel.value)
  const next = panels[(index + offset + panels.length) % panels.length]!
  activatePanel(next)
  document.getElementById(next === 'content' ? contentTabId : publicationTabId)?.focus()
}

function focusBoundaryPanel(panel: 'content' | 'publication') {
  activatePanel(panel)
  document.getElementById(panel === 'content' ? contentTabId : publicationTabId)?.focus()
}

async function handleVersionRestored() {
  await refresh()
  await showToast('success', t('form.restoredTitle'), t('form.restoredBody'))
}

/**
 * `⌘S` publishes and `⌘D` saves a draft.
 *
 * Both are browser shortcuts — save the page, bookmark it — so both are prevented rather than
 * left to fire alongside the write.
 */
function shortcut(action: 'draft' | 'main') {
  return (event: KeyboardEvent) => {
    if (!auth.canEdit.value || event.repeat || (!event.metaKey && !event.ctrlKey) || pending.value) return
    event.preventDefault()
    if (action === 'main') {
      void submitPrimary()
      return
    }
    void save(action)
  }
}

onKeyStroke('s', shortcut('main'))
onKeyStroke('d', shortcut('draft'))

const removeNavigationGuard = useRouter().beforeEach(() => {
  if (auth.canEdit.value && dirty.value && !confirm(t('form.leaveTitle'))) return false
})

onScopeDispose(removeNavigationGuard)

useEventListener('beforeunload', (event) => {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
})
</script>

<template>
  <section class="eponyme-form ep:scrollbar-thin ep:mx-auto ep:max-w-3xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <div class="ep:group ep:mt-2 ep:mb-8 ep:flex ep:flex-wrap ep:items-center ep:gap-3">
      <h1 class="ep:m-0 ep:min-w-0 ep:max-w-full ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong ep:[overflow-wrap:anywhere]">
        {{ label(name.split('/').at(-1) ?? name) }}
      </h1>
      <EPBadge :variant="publicationBadgeVariant">
        {{ publicationLabel }}
      </EPBadge>
      <EPBadge
        v-if="dirty"
        variant="danger"
      >
        {{ t('form.unsaved') }}
      </EPBadge>
      <EPTooltip :content="t('form.history')">
        <EPButton
          class="ep:focus-visible:outline-none ep:focus-visible:ring-2 ep:focus-visible:ring-contrast/30 ep:md:opacity-0 ep:md:group-hover:opacity-100 ep:md:focus-visible:opacity-100"
          icon="mingcute:history-anticlockwise-line"
          variant="ghost"
          :aria-label="t('form.openHistory')"
          @click="historyOpen = true"
        />
      </EPTooltip>
    </div>
    <p
      v-if="!eponymeData"
      class="ep:text-sm ep:text-text-muted"
    >
      {{ t('action.loading') }}
    </p>
    <!-- The schema rules are the single source of truth; native bubbles would preempt them
         with browser-locale messages and block the publish handler entirely. -->
    <form
      v-else
      novalidate
      @submit.prevent="submitPrimary"
    >
      <div
        v-if="publicationEnabled"
        role="tablist"
        :aria-label="t('form.editorSections')"
        class="ep:mb-8 ep:flex ep:gap-1 ep:border-b ep:border-border-default"
        @keydown.right.prevent="focusPanel(1)"
        @keydown.left.prevent="focusPanel(-1)"
        @keydown.home.prevent="focusBoundaryPanel('content')"
        @keydown.end.prevent="focusBoundaryPanel('publication')"
      >
        <button
          :id="contentTabId"
          type="button"
          role="tab"
          :aria-selected="activePanel === 'content'"
          :aria-controls="contentPanelId"
          :tabindex="activePanel === 'content' ? 0 : -1"
          class="ep:-mb-px ep:cursor-pointer ep:border-0 ep:border-b-2 ep:bg-transparent ep:px-4 ep:py-2.5 ep:text-sm ep:font-medium ep:transition"
          :class="activePanel === 'content' ? 'ep:border-contrast ep:text-text-strong' : 'ep:border-transparent ep:text-text-muted ep:hover:text-text-default'"
          @click="activatePanel('content')"
        >
          {{ t('form.contentTab') }}
          <span
            v-if="Object.keys(errors).some(key => key !== '_form')"
            class="ep:ml-1 ep:text-danger"
            :aria-label="t('tabs.hasErrors', { tab: t('form.contentTab') })"
          >•</span>
        </button>
        <button
          :id="publicationTabId"
          type="button"
          role="tab"
          :aria-selected="activePanel === 'publication'"
          :aria-controls="publicationPanelId"
          :tabindex="activePanel === 'publication' ? 0 : -1"
          class="ep:-mb-px ep:cursor-pointer ep:border-0 ep:border-b-2 ep:bg-transparent ep:px-4 ep:py-2.5 ep:text-sm ep:font-medium ep:transition"
          :class="activePanel === 'publication' ? 'ep:border-contrast ep:text-text-strong' : 'ep:border-transparent ep:text-text-muted ep:hover:text-text-default'"
          @click="activatePanel('publication')"
        >
          {{ t('form.publicationTab') }}
        </button>
      </div>

      <div
        v-show="activePanel === 'content'"
        :id="contentPanelId"
        role="tabpanel"
        :aria-labelledby="contentTabId"
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
              :hide-top-border="true"
              :disabled="fieldDisabled(fieldName)"
            />
            <TabsField
              v-else-if="field.type === 'tabs'"
              v-model="data[fieldName]"
              :field-name="fieldName"
              :definition="field"
              :errors="childErrors(errors, fieldName)"
              :hide-top-border="true"
              :disabled="fieldDisabled(fieldName)"
            />
            <template v-else-if="field.type === 'array'">
              <label
                :for="fieldPathId(fieldName)"
                class="ep:mb-1.5 ep:block ep:text-sm ep:font-medium ep:text-text-default"
              >
                {{ label(fieldName, field.options.label) }}<span
                  v-if="field.options.required"
                  class="ep:text-field-required"
                > *</span>
              </label>
              <p
                v-if="field.options.description"
                class="ep:mt-0 ep:mb-2 ep:text-xs ep:leading-relaxed ep:text-text-muted"
              >
                {{ field.options.description }}
              </p>
              <LazyArrayField
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
                class="ep:mt-1.5 ep:text-xs ep:text-danger"
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

      <div
        v-if="publicationEnabled"
        v-show="activePanel === 'publication'"
        :id="publicationPanelId"
        role="tabpanel"
        :aria-labelledby="publicationTabId"
        class="ep:grid ep:gap-8"
      >
        <section :aria-labelledby="`${publicationPanelId}-status`">
          <h2
            :id="`${publicationPanelId}-status`"
            class="ep:m-0 ep:text-xl ep:font-semibold ep:text-text-strong"
          >
            {{ t('form.publicationTab') }}
          </h2>
          <p class="ep:mt-1 ep:mb-0 ep:text-sm ep:leading-relaxed ep:text-text-muted">
            {{ t('form.publicationDescription') }}
          </p>
          <dl class="ep:mt-5 ep:grid ep:gap-3 ep:rounded-xl ep:bg-surface-active/50 ep:p-4 ep:text-sm ep:border ep:border-border-default">
            <div class="ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3">
              <dt class="ep:text-text-muted">
                {{ t('form.currentStatus') }}
              </dt>
              <dd class="ep:m-0">
                <EPBadge :variant="publicationBadgeVariant">
                  {{ publicationLabel }}
                </EPBadge>
              </dd>
            </div>
            <div
              v-if="publishedAt"
              class="ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3"
            >
              <dt class="ep:text-text-muted">
                {{ t('form.publishedAt') }}
              </dt>
              <dd class="ep:m-0 ep:text-text-strong">
                {{ formatDate(publishedAt) }}
              </dd>
            </div>
          </dl>
        </section>

        <section :aria-labelledby="`${publicationPanelId}-schedule`">
          <h3
            :id="`${publicationPanelId}-schedule`"
            class="ep:m-0 ep:text-base ep:font-semibold ep:text-text-strong"
          >
            {{ t('form.scheduleTitle') }}
          </h3>
          <p class="ep:mt-1 ep:mb-4 ep:text-xs ep:leading-relaxed ep:text-text-muted">
            {{ t('form.scheduleBody') }}
          </p>
          <div class="ep:grid ep:gap-4 ep:md:grid-cols-2">
            <div>
              <label
                :for="schedulePublishId"
                class="ep:mb-1.5 ep:block ep:text-sm ep:font-medium ep:text-text-default"
              >{{ t('form.scheduledPublishAt') }}</label>
              <EPInputText
                :id="schedulePublishId"
                v-model="schedulePublishValue"
                type="datetime-local"
                :invalid="Boolean(scheduleError)"
                :aria-describedby="scheduleError ? `${scheduleHintId} ${scheduleErrorId}` : scheduleHintId"
                :disabled="!auth.canEdit.value"
              />
            </div>
            <div>
              <label
                :for="scheduleUnpublishId"
                class="ep:mb-1.5 ep:block ep:text-sm ep:font-medium ep:text-text-default"
              >{{ t('form.scheduledUnpublishAt') }}</label>
              <EPInputText
                :id="scheduleUnpublishId"
                v-model="scheduleUnpublishValue"
                type="datetime-local"
                :invalid="Boolean(scheduleError)"
                :aria-describedby="scheduleError ? `${scheduleHintId} ${scheduleErrorId}` : scheduleHintId"
                :disabled="!auth.canEdit.value"
              />
            </div>
          </div>
          <p
            :id="scheduleHintId"
            class="ep:mt-2 ep:mb-0 ep:text-xs ep:leading-relaxed ep:text-text-muted"
          >
            {{ t('form.scheduleTimezone') }}
          </p>
          <p
            v-if="scheduleError"
            :id="scheduleErrorId"
            class="ep:mt-2 ep:mb-0 ep:text-xs ep:text-danger"
          >
            {{ scheduleError }}
          </p>
          <div
            v-if="auth.canEdit.value"
            class="ep:mt-4 ep:flex ep:flex-wrap ep:gap-2"
          >
            <EPButton
              size="sm"
              variant="primary"
              @click="submitSchedule"
            >
              {{ pending ? t('form.scheduling') : t('form.schedule') }}
            </EPButton>
            <EPButton
              v-if="scheduleDirty"
              size="sm"
              variant="ghost"
              @click="resetScheduleFields"
            >
              {{ t('action.cancel') }}
            </EPButton>
            <EPButton
              v-if="hasSchedule"
              size="sm"
              variant="ghost"
              @click="save('unschedule')"
            >
              {{ t('form.unschedule') }}
            </EPButton>
          </div>
        </section>

        <section
          v-if="auth.canEdit.value"
          :aria-labelledby="`${publicationPanelId}-actions`"
        >
          <h3
            :id="`${publicationPanelId}-actions`"
            class="ep:m-0 ep:text-base ep:font-semibold ep:text-text-strong"
          >
            {{ t('form.publicationActions') }}
          </h3>
          <div class="ep:mt-4 ep:flex ep:flex-wrap ep:gap-2">
            <EPButton
              size="sm"
              variant="primary"
              @click="save('publish')"
            >
              {{ t('form.publish') }}
            </EPButton>
            <EPButton
              v-if="status === 'published'"
              size="sm"
              @click="save('revertToDraft')"
            >
              {{ t('form.revertToDraft') }}
            </EPButton>
            <EPButton
              v-if="status === 'published'"
              size="sm"
              variant="danger"
              @click="save('unpublish')"
            >
              {{ t('form.unpublish') }}
            </EPButton>
          </div>
        </section>
      </div>

      <p
        v-if="errors._form"
        class="ep:mt-1 ep:text-xs ep:text-danger"
      >
        {{ errors._form.join(' ') }}
      </p>
      <div
        v-if="activePanel === 'content'"
        class="ep:sticky ep:bottom-4 ep:z-20 ep:mt-8 ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3 ep:rounded-xl ep:bg-surface-raised/70 ep:p-3 ep:backdrop-blur-xl"
      >
        <div class="ep:flex ep:flex-wrap ep:items-center ep:gap-2">
          <EPButton
            v-if="auth.canEdit.value"
            type="submit"
            size="sm"
            variant="primary"
            :disabled="pending"
            :loading="pending"
            :title="t('form.primaryShortcut')"
          >
            {{ primaryActionLabel }}
          </EPButton>
          <EPButton
            v-if="auth.canEdit.value && !hasSchedule && status !== 'published'"
            size="sm"
            :disabled="pending"
            :title="t('form.saveShortcut')"
            @click="save('draft')"
          >
            {{ pending ? t('form.saving') : t('form.saveDraft') }}
          </EPButton>
          <EPButton
            v-if="auth.canEdit.value && publicationEnabled"
            size="sm"
            variant="ghost"
            @click="focusBoundaryPanel('publication')"
          >
            {{ t('form.publicationTab') }}
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
            {{ previewOpen ? t('form.hidePreview') : t('form.preview') }}
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
