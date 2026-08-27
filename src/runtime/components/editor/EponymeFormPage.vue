<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useAsyncData, useRequestFetch } from '#app'
import { FlexRender, createColumnHelper, getCoreRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import type { EponymeFormDefinitionBase } from '../../types'
import type { EponymeFormSubmission, EponymeFormSubmissionPage } from '../../server/services/eponyme-form-store'
import { humanizeLabel } from '../../utils/humanize-label'
import { getEponymeErrorMessage } from '../../utils/eponyme-error'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import EPAlertDialog from '../ui/EPAlertDialog.vue'
import EPBadge from '../ui/EPBadge.vue'
import EPButton from '../ui/EPButton.vue'
import EPCheckbox from '../ui/EPCheckbox.vue'
import EPDialog from '../ui/EPDialog.vue'
import EPInputText from '../ui/EPInputText.vue'
import { EPONYME_DATE_LOCALE } from '../../utils/date-locale'

const props = defineProps<{ name: string, definition: EponymeFormDefinitionBase }>()

const requestFetch = useRequestFetch()
const auth = useEponymeAuth()
const formResource = computed(() => ({ kind: 'form' as const, name: props.name }))
const canDelete = computed(() => auth.can('submissions.delete', formResource.value))
const collects = computed(() => props.definition.submission.store)
const page = ref(1)
const search = ref('')
const debouncedSearch = refDebounced(search, 300)
const sorting = ref<SortingState>([{ id: 'createdAt', desc: true }])
const selected = ref<EponymeFormSubmission>()
/**
 * Ticked rows, by id. Kept to the page on screen: the pager loads one page at a time, so a
 * selection spanning pages would be a promise the "select all" tickbox cannot keep.
 */
const selectedIds = ref(new Set<string>())
const submissionAction = ref<{ type: 'clear' } | { type: 'deleteSelection' } | { type: 'delete', submission: EponymeFormSubmission }>()
const submissionActionPending = ref(false)
const submissionActionError = ref('')

const label = computed(() => props.definition.label || humanizeLabel(props.name.split('/').at(-1) || props.name))
/** Whether the form has submissions at all, which a filtered response must not answer. */
const hasSubmissions = ref(false)

const { data: response, pending, refresh } = useAsyncData(
  () => `eponyme:form:${props.name}`,
  () => collects.value
    ? requestFetch<EponymeFormSubmissionPage>(`/api/eponyme-forms/${props.name}/submissions`, {
        query: { page: page.value, search: debouncedSearch.value || undefined },
      })
    : Promise.resolve(undefined),
  { watch: [page, debouncedSearch, () => props.name] },
)

watch(response, (value) => {
  if (value && !debouncedSearch.value) hasSubmissions.value = value.total > 0
}, { immediate: true })

const submissions = computed(() => response.value?.submissions ?? [])
const total = computed(() => response.value?.total ?? 0)
const perPage = computed(() => response.value?.perPage ?? 25)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

const pageIds = computed(() => submissions.value.map(submission => submission.id))
const selectionCount = computed(() => selectedIds.value.size)
const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every(id => selectedIds.value.has(id)))

function isSelected(id: string) {
  return selectedIds.value.has(id)
}

function toggleSelected(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleAllSelected(checked: boolean) {
  selectedIds.value = checked ? new Set(pageIds.value) : new Set()
}

const columnHelper = createColumnHelper<EponymeFormSubmission>()

// Values are stringified here so the table stays agnostic of the field types.
const columns = computed<Array<ColumnDef<EponymeFormSubmission, string>>>(() => [
  ...Object.entries(props.definition.fields).map(([fieldName, field]) => columnHelper.accessor(
    row => formatValue(row.data[fieldName]),
    {
      id: fieldName,
      header: humanizeLabel(fieldName, field.options.label),
      cell: info => truncate(info.getValue()) || t('action.empty'),
    },
  )),
  columnHelper.accessor(row => row.createdAt, {
    id: 'createdAt',
    header: t('submissions.received'),
    cell: info => formatDate(info.getValue()),
  }),
] as Array<ColumnDef<EponymeFormSubmission, string>>)

const table = useVueTable({
  get data() { return submissions.value },
  get columns() { return columns.value },
  state: {
    get sorting() { return sorting.value },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  // Sorting is client-side, so it only reorders the page currently loaded.
  getSortedRowModel: getSortedRowModel(),
})

watch(() => props.name, () => {
  page.value = 1
  search.value = ''
  hasSubmissions.value = false
  selected.value = undefined
})

watch(debouncedSearch, () => {
  page.value = 1
})

// Whatever replaces the rows on screen also replaces what "the selection" means.
watch([page, debouncedSearch, () => props.name], () => {
  selectedIds.value = new Set()
})

function formatValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(item => formatValue(item)).join(', ')
  if (typeof value === 'boolean') return value ? t('action.yes') : t('action.no')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function truncate(value: string, maxLength = 60) {
  const characters = [...value]
  return characters.length <= maxLength ? value : `${characters.slice(0, maxLength - 1).join('')}…`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(EPONYME_DATE_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function requestClearAll() {
  submissionAction.value = { type: 'clear' }
  submissionActionError.value = ''
}

function requestDeleteSelection() {
  if (!selectionCount.value) return
  submissionAction.value = { type: 'deleteSelection' }
  submissionActionError.value = ''
}

function requestDeleteSubmission(submission: EponymeFormSubmission) {
  submissionAction.value = { type: 'delete', submission }
  submissionActionError.value = ''
}

/**
 * Three confirmations share one dialog, so the wording is chosen here rather than in three
 * nested ternaries in the template.
 */
const actionCopy = computed(() => {
  const action = submissionAction.value
  if (action?.type === 'clear') {
    return {
      title: 'submissions.clearTitle',
      description: 'submissions.clearDescription',
      confirm: 'submissions.clearAction',
      params: { count: total.value, form: label.value },
    }
  }
  if (action?.type === 'deleteSelection') {
    return {
      title: 'submissions.deleteSelectionTitle',
      description: 'submissions.deleteSelectionDescription',
      confirm: 'submissions.deleteSelection',
      params: { count: selectionCount.value },
    }
  }
  return {
    title: 'submissions.deleteTitle',
    description: 'submissions.deleteDescription',
    confirm: 'submissions.deleteAction',
    params: undefined,
  }
})

function setSubmissionActionOpen(open: boolean) {
  if (open || submissionActionPending.value) return
  submissionAction.value = undefined
  submissionActionError.value = ''
}

async function confirmSubmissionAction() {
  const action = submissionAction.value
  if (!action || submissionActionPending.value) return
  submissionActionPending.value = true
  submissionActionError.value = ''
  try {
    if (action.type === 'clear') {
      await requestFetch(`/api/eponyme-forms/${props.name}/submissions`, { method: 'DELETE' })
      selected.value = undefined
      selectedIds.value = new Set()
      page.value = 1
      await refresh()
    }
    else if (action.type === 'deleteSelection') {
      const ids = [...selectedIds.value]
      await requestFetch(`/api/eponyme-forms/${props.name}/submissions`, { method: 'DELETE', query: { ids } })
      if (selected.value && ids.includes(selected.value.id)) selected.value = undefined
      selectedIds.value = new Set()
      // Emptying the page would otherwise leave a listing with nothing on it.
      if (ids.length >= submissions.value.length && page.value > 1) page.value -= 1
      else await refresh()
    }
    else {
      await requestFetch(`/api/eponyme-forms/${props.name}/submissions/${action.submission.id}`, { method: 'DELETE' })
      if (selected.value?.id === action.submission.id) selected.value = undefined
      toggleSelected(action.submission.id, false)
      // Deleting the last row of a page would otherwise leave an empty view.
      if (submissions.value.length === 1 && page.value > 1) page.value -= 1
      else await refresh()
    }
    submissionAction.value = undefined
  }
  catch (caught) {
    submissionActionError.value = getEponymeErrorMessage(
      caught,
      t(action.type === 'clear' ? 'submissions.clearFailed' : 'submissions.deleteFailed'),
    )
  }
  finally {
    submissionActionPending.value = false
  }
}
</script>

<template>
  <section class="ep:mx-auto ep:w-full ep:max-w-5xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <header class="ep:flex ep:flex-wrap ep:items-start ep:justify-between ep:gap-4">
      <div>
        <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
          {{ label }}
        </h1>
        <p
          v-if="definition.description"
          class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-text-muted"
        >
          {{ definition.description }}
        </p>
      </div>
      <div class="ep:flex ep:items-center ep:gap-3">
        <EPBadge :variant="collects ? 'managed' : 'neutral'">
          {{ t(definition.submission.mode === 'managed' ? 'submissions.modeManaged' : 'submissions.modeCustom') }}
        </EPBadge>
        <EPButton
          v-if="collects && canDelete && total > 0"
          size="sm"
          variant="danger"
          @click="requestClearAll"
        >
          {{ t('action.clearAll') }}
        </EPButton>
      </div>
    </header>

    <div
      v-if="collects && (hasSubmissions || search)"
      class="ep:relative ep:mt-8 ep:max-w-xs"
    >
      <Icon
        name="mingcute:search-line"
        size="15"
        aria-hidden="true"
        class="ep:pointer-events-none ep:absolute ep:top-1/2 ep:left-3 ep:-translate-y-1/2 ep:text-text-muted"
      />
      <EPInputText
        v-model="search"
        padded="start"
        size="sm"
        type="search"
        :placeholder="t('submissions.search')"
        :aria-label="t('submissions.search')"
      />
    </div>

    <div
      v-if="!collects"
      class="ep:mt-8 ep:rounded-xl ep:border ep:border-dashed ep:border-border-default ep:p-8 ep:text-center"
    >
      <p class="ep:m-0 ep:text-sm ep:text-text-muted">
        {{ t('submissions.customTitle') }}
      </p>
      <p class="ep:mt-2 ep:mb-0 ep:text-xs ep:text-text-muted">
        {{ t('submissions.customHint') }}
      </p>
    </div>
    <p
      v-else-if="pending && !submissions.length"
      class="ep:mt-8 ep:text-sm ep:text-text-muted"
    >
      {{ t('action.loading') }}
    </p>
    <div
      v-else-if="submissions.length"
      class="ep:mt-8"
    >
      <div
        v-if="selectionCount"
        class="ep:mb-3 ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3 ep:rounded-xl ep:bg-surface-active ep:px-4 ep:py-3"
        role="status"
      >
        <p class="ep:m-0 ep:text-sm ep:text-text-strong">
          {{ t('submissions.selected', { count: selectionCount }) }}
        </p>
        <div class="ep:flex ep:gap-2">
          <EPButton
            size="sm"
            @click="toggleAllSelected(false)"
          >
            {{ t('submissions.clearSelection') }}
          </EPButton>
          <EPButton
            v-if="canDelete"
            size="sm"
            variant="danger"
            @click="requestDeleteSelection"
          >
            {{ t('submissions.deleteSelection') }}
          </EPButton>
        </div>
      </div>
      <div class="ep:overflow-x-auto ep:rounded-xl ep:bg-surface-active/50">
        <table class="ep:w-full ep:table-fixed ep:border-collapse ep:text-left ep:text-sm">
          <thead>
            <tr
              v-for="headerGroup in table.getHeaderGroups()"
              :key="headerGroup.id"
            >
              <th
                scope="col"
                class="ep:w-12 ep:border-b ep:border-border-default ep:p-3"
              >
                <EPCheckbox
                  :model-value="allSelected"
                  :aria-label="t('submissions.selectAll')"
                  @update:model-value="toggleAllSelected"
                />
              </th>
              <th
                v-for="header in headerGroup.headers"
                :key="header.id"
                scope="col"
                class="ep:border-b ep:border-border-default ep:p-3 ep:text-xs ep:font-semibold ep:text-text-muted ep:uppercase ep:w-[230px]"
              >
                <button
                  type="button"
                  class="ep:flex ep:cursor-pointer ep:items-center ep:gap-1 ep:border-0 ep:bg-transparent ep:p-0 ep:text-inherit"
                  :aria-sort="header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'"
                  @click="header.column.toggleSorting()"
                >
                  <FlexRender
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                  <span aria-hidden="true">{{ header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : '' }}</span>
                </button>
              </th>
              <th
                scope="col"
                class="ep:relative ep:border-b ep:border-border-default ep:p-3"
              >
                <span class="ep:sr-only">{{ t('action.actions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              class="ep:group ep:border-b ep:border-border-default/50 ep:last:border-0"
              :class="{ 'ep:bg-contrast/5': isSelected(row.original.id) }"
            >
              <td class="ep:p-3 ep:align-top">
                <EPCheckbox
                  :model-value="isSelected(row.original.id)"
                  :aria-label="t('submissions.selectRow')"
                  @update:model-value="toggleSelected(row.original.id, $event)"
                />
              </td>
              <td
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                class="ep:p-3 ep:align-top ep:break-words ep:text-text-strong"
              >
                <button
                  type="button"
                  class="ep:cursor-pointer ep:border-0 ep:bg-transparent ep:p-0 ep:text-left ep:text-inherit"
                  @click="selected = row.original"
                >
                  <FlexRender
                    :render="cell.column.columnDef.cell"
                    :props="cell.getContext()"
                  />
                </button>
              </td>
              <td class="ep:p-3 ep:text-right ep:align-top">
                <EPButton
                  v-if="canDelete"
                  size="sm"
                  variant="danger"
                  class="ep:opacity-0 ep:group-hover:opacity-100 ep:focus-visible:opacity-100"
                  @click="requestDeleteSubmission(row.original)"
                >
                  {{ t('action.delete') }}
                </EPButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ep:mt-4 ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3">
        <p class="ep:m-0 ep:text-xs ep:text-text-muted">
          {{ t('submissions.pager', { count: total, page, pages: pageCount }) }}
        </p>
        <div class="ep:flex ep:gap-2">
          <EPButton
            size="sm"
            :disabled="page <= 1"
            @click="page -= 1"
          >
            {{ t('action.previous') }}
          </EPButton>
          <EPButton
            size="sm"
            :disabled="page >= pageCount"
            @click="page += 1"
          >
            {{ t('action.next') }}
          </EPButton>
        </div>
      </div>
    </div>
    <div
      v-else
      class="ep:mt-8 ep:rounded-xl ep:border ep:border-dashed ep:border-border-default ep:p-8 ep:text-center"
    >
      <p class="ep:m-0 ep:text-sm ep:text-text-muted">
        {{ search ? t('submissions.noMatch', { query: search }) : t('submissions.empty') }}
      </p>
    </div>

    <EPDialog
      :open="Boolean(selected)"
      :title="t('submissions.detail')"
      :description="selected ? formatDate(selected.createdAt) : ''"
      @update:open="value => { if (!value) selected = undefined }"
    >
      <dl
        v-if="selected"
        class="ep:m-0 ep:grid ep:gap-4"
      >
        <div
          v-for="(field, fieldName) in definition.fields"
          :key="fieldName"
        >
          <dt class="ep:text-[11px] ep:font-semibold ep:text-text-muted">
            {{ humanizeLabel(String(fieldName), field.options.label) }}
          </dt>
          <dd class="ep:m-0 ep:mt-1 ep:whitespace-pre-wrap ep:text-sm ep:text-text-strong">
            {{ formatValue(selected.data[fieldName]) || t('action.empty') }}
          </dd>
        </div>
      </dl>
    </EPDialog>

    <EPAlertDialog
      :open="Boolean(submissionAction)"
      :label="submissionAction ? t(actionCopy.title) : ''"
      :description="submissionAction ? t(actionCopy.description, actionCopy.params) : ''"
      :confirm-label="submissionAction ? t(actionCopy.confirm) : ''"
      confirm-variant="danger"
      :confirm-loading="submissionActionPending"
      :close-on-confirm="false"
      @update:open="setSubmissionActionOpen"
      @confirm="confirmSubmissionAction"
    >
      <p
        v-show="submissionActionError"
        role="alert"
        class="ep:m-0 ep:rounded-lg ep:bg-danger/10 ep:p-3 ep:text-sm ep:text-danger"
      >
        {{ submissionActionError }}
      </p>
    </EPAlertDialog>
  </section>
</template>
