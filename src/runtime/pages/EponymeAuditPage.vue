<script setup lang="ts">
import { t } from '#eponyme/locale'
import { useRequestFetch, useSeoMeta } from '#app'
import { computed, ref } from 'vue'
import type { EponymeAuditEvent, EponymeAuditPage } from '../types'
import { useEponymeFavicon } from '../composables/useEponymeFavicon'
import EPBadge from '../components/ui/EPBadge.vue'
import EPButton from '../components/ui/EPButton.vue'
import EPInputText from '../components/ui/EPInputText.vue'
import EPTooltip from '../components/ui/EPTooltip.vue'
import { EPONYME_DATE_LOCALE } from '../utils/date-locale'
import { middleEllipsis } from '../utils/middle-ellipsis'
import '../assets/dashboard.css'

useEponymeFavicon()
useSeoMeta({ title: t('audit.title') })

/** A collection entry under a few folders outgrows the column long before it stops mattering. */
const RESOURCE_LENGTH = 32
const resourceOf = (event: EponymeAuditEvent) => event.resourceName || event.targetUserId || '—'
const isTruncated = (value: string) => [...value].length > RESOURCE_LENGTH

const requestFetch = useRequestFetch()
const events = ref<EponymeAuditEvent[]>([])
const cursor = ref<string | null>(null)
const pending = ref(false)
const error = ref('')
const action = ref('')
const resource = ref('')
const from = ref('')
const to = ref('')
const hasFilters = computed(() => Boolean(action.value || resource.value || from.value || to.value))

await load(true)

async function load(reset = false) {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const page = await requestFetch<EponymeAuditPage>('/api/eponyme-audit', {
      cache: 'no-store',
      query: {
        cursor: reset ? undefined : cursor.value ?? undefined,
        action: action.value || undefined,
        resourceName: resource.value || undefined,
        from: from.value || undefined,
        to: to.value || undefined,
      },
    })
    events.value = reset ? page.events : [...events.value, ...page.events]
    cursor.value = page.nextCursor
  }
  catch {
    error.value = t('audit.loadFailed')
  }
  finally {
    pending.value = false
  }
}

async function clearFilters() {
  action.value = ''
  resource.value = ''
  from.value = ''
  to.value = ''
  await load(true)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(EPONYME_DATE_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}
</script>

<template>
  <section class="ep:mx-auto ep:w-full ep:max-w-6xl ep:px-6 ep:py-8 ep:md:px-10 ep:md:py-12">
    <header>
      <h1 class="ep:mt-2 ep:mb-0 ep:text-3xl ep:font-semibold ep:tracking-tight ep:text-text-strong">
        {{ t('audit.heading') }}
      </h1>
      <p class="ep:mt-2 ep:mb-0 ep:text-sm ep:text-text-muted">
        {{ t('audit.description') }}
      </p>
    </header>

    <form
      class="ep:mt-8 ep:grid ep:gap-3 ep:sm:grid-cols-2 ep:lg:grid-cols-4"
      @submit.prevent="load(true)"
    >
      <label class="ep:grid ep:gap-1 ep:text-xs ep:font-medium ep:text-text-muted">
        {{ t('audit.action') }}
        <EPInputText
          v-model="action"
          size="sm"
          placeholder="content.published"
        />
      </label>
      <label class="ep:grid ep:gap-1 ep:text-xs ep:font-medium ep:text-text-muted">
        {{ t('audit.resource') }}
        <EPInputText
          v-model="resource"
          size="sm"
          placeholder="articles"
        />
      </label>
      <label class="ep:grid ep:gap-1 ep:text-xs ep:font-medium ep:text-text-muted">
        {{ t('audit.from') }}
        <EPInputText
          v-model="from"
          type="date"
          size="sm"
        />
      </label>
      <label class="ep:grid ep:gap-1 ep:text-xs ep:font-medium ep:text-text-muted">
        {{ t('audit.to') }}
        <EPInputText
          v-model="to"
          type="date"
          size="sm"
        />
      </label>
      <div class="ep:flex ep:gap-2 ep:sm:col-span-2 ep:lg:col-span-4">
        <EPButton
          type="submit"
          size="sm"
          variant="primary"
          :loading="pending"
        >
          {{ t('audit.filter') }}
        </EPButton>
        <EPButton
          v-if="hasFilters"
          size="sm"
          @click="clearFilters"
        >
          {{ t('audit.clear') }}
        </EPButton>
      </div>
    </form>

    <p
      v-show="error"
      role="alert"
      class="ep:mt-6 ep:text-sm ep:text-danger"
    >
      {{ error }}
    </p>

    <div class="ep:mt-8 ep:overflow-x-auto ep:rounded-xl ep:border ep:border-border-default">
      <table class="ep:w-full ep:border-collapse ep:text-left ep:text-sm">
        <thead class="ep:bg-surface-active/60 ep:text-xs ep:text-text-muted">
          <tr>
            <th
              scope="col"
              class="ep:p-3"
            >
              {{ t('audit.date') }}
            </th>
            <th
              scope="col"
              class="ep:p-3"
            >
              {{ t('audit.actor') }}
            </th>
            <th
              scope="col"
              class="ep:p-3"
            >
              {{ t('audit.action') }}
            </th>
            <th
              scope="col"
              class="ep:p-3"
            >
              {{ t('audit.resource') }}
            </th>
            <th
              scope="col"
              class="ep:p-3"
            >
              {{ t('audit.outcome') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="event in events"
            :key="event.id"
            class="ep:border-t ep:border-border-default"
          >
            <td class="ep:whitespace-nowrap ep:p-3 ep:text-text-muted">
              {{ formatDate(event.occurredAt) }}
            </td>
            <td class="ep:p-3 ep:text-text-strong">
              {{ event.actorUsername || t('audit.system') }}
            </td>
            <td class="ep:p-3 ep:font-mono ep:text-xs ep:text-text-strong">
              {{ event.action }}
            </td>
            <td class="ep:p-3 ep:text-text-muted">
              <EPTooltip
                v-if="isTruncated(resourceOf(event))"
                :content="resourceOf(event)"
              >
                <span>{{ middleEllipsis(resourceOf(event), RESOURCE_LENGTH) }}</span>
              </EPTooltip>
              <template v-else>
                {{ resourceOf(event) }}
              </template>
            </td>
            <td class="ep:p-3">
              <EPBadge :variant="event.outcome === 'success' ? 'success' : 'danger'">
                {{ t(event.outcome === 'success' ? 'audit.success' : 'audit.failure') }}
              </EPBadge>
            </td>
          </tr>
          <tr v-if="!events.length && !pending">
            <td
              colspan="5"
              class="ep:p-8 ep:text-center ep:text-text-muted"
            >
              {{ t('audit.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="cursor"
      class="ep:mt-4 ep:flex ep:justify-center"
    >
      <EPButton
        :loading="pending"
        @click="load(false)"
      >
        {{ t('audit.more') }}
      </EPButton>
    </div>
  </section>
</template>
