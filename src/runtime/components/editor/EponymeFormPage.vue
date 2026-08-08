<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useAsyncData, useRequestFetch } from '#app'
import { FlexRender, createColumnHelper, getCoreRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import type { EponymeFormDefinitionBase } from '../../types'
import type { EponymeFormSubmission, EponymeFormSubmissionPage } from '../../server/services/eponyme-form-store'
import { humanizeLabel } from '../../utils/humanize-label'
import { useEponymeAuth } from '../../composables/useEponymeAuth'
import EPBadge from '../ui/EPBadge.vue'
import EPButton from '../ui/EPButton.vue'
import EPDialog from '../ui/EPDialog.vue'
import { EPONYME_DATE_LOCALE } from '../../utils/date-locale'

const props = defineProps<{ name: string, definition: EponymeFormDefinitionBase }>()

const requestFetch = useRequestFetch()
const auth = useEponymeAuth()
const managed = computed(() => props.definition.submission.mode === 'managed')
const page = ref(1)
const sorting = ref<SortingState>([{ id: 'createdAt', desc: true }])
const selected = ref<EponymeFormSubmission>()
const clearing = ref(false)

const label = computed(() => props.definition.label || humanizeLabel(props.name.split('/').at(-1) || props.name))

const { data: response, pending, refresh } = useAsyncData(
  () => `eponyme:form:${props.name}:${page.value}`,
  () => managed.value
    ? requestFetch<EponymeFormSubmissionPage>(`/api/eponyme-forms/${props.name}/submissions`, { query: { page: page.value } })
    : Promise.resolve(undefined),
  { watch: [page, () => props.name] },
)

const submissions = computed(() => response.value?.submissions ?? [])
const total = computed(() => response.value?.total ?? 0)
const perPage = computed(() => response.value?.perPage ?? 25)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

const columnHelper = createColumnHelper<EponymeFormSubmission>()

// Values are stringified here so the table stays agnostic of the field types.
const columns = computed<Array<ColumnDef<EponymeFormSubmission, string>>>(() => [
  ...Object.entries(props.definition.fields).map(([fieldName, field]) => columnHelper.accessor(
    row => formatValue(row.data[fieldName]),
    {
      id: fieldName,
      header: humanizeLabel(fieldName, field.options.label),
      // Never empty: SSR emits nothing for an empty string while the client still
      // builds a text node, which hydrates as a missing child. The dash also makes
      // an unanswered optional field readable instead of looking like a broken cell.
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
  selected.value = undefined
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

async function clearAll() {
  if (!confirm(`Delete all ${total.value} submissions of “${label.value}”? This cannot be undone.`)) return
  clearing.value = true
  try {
    await requestFetch(`/api/eponyme-forms/${props.name}/submissions`, { method: 'DELETE' })
    selected.value = undefined
    page.value = 1
    await refresh()
  }
  finally {
    clearing.value = false
  }
}

async function deleteSubmission(submission: EponymeFormSubmission) {
  if (!confirm('Delete this submission? This cannot be undone.')) return
  await requestFetch(`/api/eponyme-forms/${props.name}/submissions/${submission.id}`, { method: 'DELETE' })
  if (selected.value?.id === submission.id) selected.value = undefined
  // Deleting the last row of a page would otherwise leave an empty view.
  if (submissions.value.length === 1 && page.value > 1) page.value -= 1
  else await refresh()
}
</script>

<template>
  <section class="ep:mx-auto ep:w-full ep:max-w-5xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <header class="ep:flex ep:flex-wrap ep:items-start ep:justify-between ep:gap-4">
      <div>
        <p class="ep:m-0 ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
          Form
        </p>
        <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-white">
          {{ label }}
        </h1>
        <p
          v-if="definition.description"
          class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-muted-ep"
        >
          {{ definition.description }}
        </p>
      </div>
      <div class="ep:flex ep:items-center ep:gap-3">
        <EPBadge :variant="managed ? 'success' : 'neutral'">
          {{ definition.submission.mode }}
        </EPBadge>
        <EPButton
          v-if="managed && auth.canEdit.value && total > 0"
          size="sm"
          variant="danger"
          :loading="clearing"
          @click="clearAll"
        >
          Clear all
        </EPButton>
      </div>
    </header>

    <div
      v-if="!managed"
      class="ep:mt-8 ep:rounded-xl ep:border ep:border-dashed ep:border-border-ep ep:p-8 ep:text-center"
    >
      <p class="ep:m-0 ep:text-sm ep:text-muted-ep">
        This form uses the custom submission mode, so Eponyme does not store its submissions.
      </p>
      <p class="ep:mt-2 ep:mb-0 ep:text-xs ep:text-muted-ep">
        Switch it to <code>submission: {{ '{' }} mode: 'managed' {{ '}' }}</code> to collect them here.
      </p>
    </div>
    <p
      v-else-if="pending"
      class="ep:mt-8 ep:text-sm ep:text-muted-ep"
    >
      Loading…
    </p>
    <div
      v-else-if="submissions.length"
      class="ep:mt-8"
    >
      <div class="ep:overflow-x-auto ep:rounded-xl ep:bg-selected-ep/50">
        <table class="ep:w-full ep:border-collapse ep:text-left ep:text-sm">
          <thead>
            <tr
              v-for="headerGroup in table.getHeaderGroups()"
              :key="headerGroup.id"
            >
              <th
                v-for="header in headerGroup.headers"
                :key="header.id"
                scope="col"
                class="ep:border-b ep:border-border-ep ep:p-3 ep:text-[11px] ep:font-semibold ep:text-muted-ep ep:uppercase"
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
                class="ep:relative ep:border-b ep:border-border-ep ep:p-3"
              >
                <span class="ep:sr-only">{{ t('action.actions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              class="ep:group ep:border-b ep:border-border-ep/50 ep:last:border-0"
            >
              <td
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                class="ep:p-3 ep:align-top ep:text-white"
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
                  v-if="auth.canEdit.value"
                  size="sm"
                  variant="danger"
                  class="ep:opacity-0 ep:group-hover:opacity-100 ep:focus-visible:opacity-100"
                  @click="deleteSubmission(row.original)"
                >
                  Delete
                </EPButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ep:mt-4 ep:flex ep:flex-wrap ep:items-center ep:justify-between ep:gap-3">
        <p class="ep:m-0 ep:text-xs ep:text-muted-ep">
          {{ t('submissions.pager', { count: total, page, pages: pageCount }) }}
        </p>
        <div class="ep:flex ep:gap-2">
          <EPButton
            size="sm"
            :disabled="page <= 1"
            @click="page -= 1"
          >
            Previous
          </EPButton>
          <EPButton
            size="sm"
            :disabled="page >= pageCount"
            @click="page += 1"
          >
            Next
          </EPButton>
        </div>
      </div>
    </div>
    <div
      v-else
      class="ep:mt-8 ep:rounded-xl ep:border ep:border-dashed ep:border-border-ep ep:p-8 ep:text-center"
    >
      <p class="ep:m-0 ep:text-sm ep:text-muted-ep">
        No submissions yet.
      </p>
    </div>

    <EPDialog
      :open="Boolean(selected)"
      title="Submission"
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
          <dt class="ep:text-[11px] ep:font-semibold ep:tracking-widest ep:text-muted-ep ep:uppercase">
            {{ humanizeLabel(String(fieldName), field.options.label) }}
          </dt>
          <dd class="ep:m-0 ep:mt-1 ep:whitespace-pre-wrap ep:text-sm ep:text-white">
            {{ formatValue(selected.data[fieldName]) || '—' }}
          </dd>
        </div>
      </dl>
    </EPDialog>
  </section>
</template>
