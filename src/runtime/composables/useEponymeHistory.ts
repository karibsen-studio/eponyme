import { useRequestFetch } from '#app'
import { ref } from 'vue'
import type { EponymeHistoryEntry } from '../server/services/eponyme-store'
import { EPONYME_DATE_LOCALE } from '../utils/date-locale'

export function useEponymeHistory(name: () => string) {
  const requestFetch = useRequestFetch()
  const history = ref<EponymeHistoryEntry[]>([])
  const pending = ref(false)
  const error = ref('')

  async function load() {
    pending.value = true
    error.value = ''
    try {
      const response = await requestFetch<{ history: EponymeHistoryEntry[] }>(`/api/eponyme-history/${name()}`)
      history.value = response.history
    }
    catch {
      error.value = 'Unable to load version history.'
    }
    finally {
      pending.value = false
    }
  }

  return { history, pending, error, load }
}

export function formatVersionDate(value: string) {
  return new Intl.DateTimeFormat(EPONYME_DATE_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
