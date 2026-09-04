import { useRequestFetch, useState } from '#app'
import { computed } from 'vue'
import type { EponymeCollectionDefinitionBase } from '../types'
import type { EponymeCollectionEntryMeta, EponymeStatus } from '../server/services/eponyme-store'
import { getEponymeCollections } from '../utils/get-eponyme-schemas'
import { useEponymeAuth } from './useEponymeAuth'
import { useEponymeConfig } from './useEponymeConfig'

/** Entries fetched per collection, at first load and on every `loadMore`. */
export const EPONYME_NAVIGATION_PAGE_SIZE = 30
/** Matches shown per collection while the sidebar search is active. */
const SEARCH_PAGE_SIZE = 20

/** What the sidebar renders: publication statuses and collection entries. */
export function useEponymeNavigation() {
  const config = useEponymeConfig()
  const auth = useEponymeAuth()
  const requestFetch = useRequestFetch()
  const statuses = useState<Record<string, EponymeStatus>>('eponyme:entry-statuses', () => ({}))
  const collectionEntries = useState<Record<string, EponymeCollectionEntryMeta[]>>('eponyme:collection-entries', () => ({}))
  const collectionTotals = useState<Record<string, number>>('eponyme:collection-totals', () => ({}))
  const searchEntries = useState<Record<string, EponymeCollectionEntryMeta[]>>('eponyme:collection-search', () => ({}))
  const loadingMore = useState<string[]>('eponyme:collection-loading', () => [])
  /** Only the latest search may write its results, so a slow one cannot land after a newer one. */
  const searchToken = useState<number>('eponyme:collection-search-token', () => 0)

  const allCollections = getEponymeCollections(config)
  const collections = computed<Record<string, EponymeCollectionDefinitionBase>>(() => Object.fromEntries(
    Object.entries(allCollections).filter(([name]) => auth.can('content.read', { kind: 'collection', name })),
  ))

  function rememberStatuses(entries: EponymeCollectionEntryMeta[], name: string) {
    for (const entry of entries) statuses.value[`${name}/${entry.slug}`] = entry.status
  }

  function fetchPage(name: string, query: { take: number, skip?: number, search?: string }) {
    return requestFetch<{ entries: EponymeCollectionEntryMeta[], total: number }>(`/api/eponyme-collections/${name}`, {
      // `fields=meta` drops the payload of every entry: the menu shows titles and statuses.
      query: { version: 'draft', raw: 1, fields: 'meta', ...query },
    })
  }

  async function load() {
    const names = Object.keys(collections.value)
    const [statusResponse, ...pages] = await Promise.all([
      requestFetch<{ statuses: Record<string, EponymeStatus> }>('/api/eponyme-statuses'),
      ...names.map(name => fetchPage(name, { take: EPONYME_NAVIGATION_PAGE_SIZE })),
    ])
    statuses.value = { ...statusResponse.statuses }
    collectionEntries.value = Object.fromEntries(names.map((name, index) => [name, pages[index]?.entries ?? []]))
    collectionTotals.value = Object.fromEntries(names.map((name, index) => [name, pages[index]?.total ?? 0]))
    for (const [name, entries] of Object.entries(collectionEntries.value)) rememberStatuses(entries, name)
  }

  function hasMore(name: string) {
    return (collectionEntries.value[name]?.length ?? 0) < (collectionTotals.value[name] ?? 0)
  }

  async function loadMore(name: string) {
    if (!hasMore(name) || loadingMore.value.includes(name)) return
    loadingMore.value = [...loadingMore.value, name]
    try {
      const loaded = collectionEntries.value[name] ?? []
      const page = await fetchPage(name, { take: EPONYME_NAVIGATION_PAGE_SIZE, skip: loaded.length })
      // An entry created or removed since the first page shifts the window, so the same slug can come back
      // twice.
      const seen = new Set(loaded.map(entry => entry.slug))
      const added = page.entries.filter(entry => !seen.has(entry.slug))
      collectionEntries.value = { ...collectionEntries.value, [name]: [...loaded, ...added] }
      collectionTotals.value = { ...collectionTotals.value, [name]: page.total }
      rememberStatuses(added, name)
    }
    finally {
      loadingMore.value = loadingMore.value.filter(item => item !== name)
    }
  }

  function isLoadingMore(name: string) {
    return loadingMore.value.includes(name)
  }

  /**
   * The sidebar search runs on the server: with one page loaded per collection, filtering what is in memory
   * would only ever find the entries already scrolled past.
   */
  async function search(query: string) {
    const term = query.trim()
    const token = searchToken.value + 1
    searchToken.value = token
    if (!term) {
      searchEntries.value = {}
      return
    }
    const names = Object.keys(collections.value)
    const pages = await Promise.all(names.map(name => fetchPage(name, { take: SEARCH_PAGE_SIZE, search: term })))
    if (searchToken.value !== token) return
    searchEntries.value = Object.fromEntries(names.map((name, index) => [name, pages[index]?.entries ?? []]))
    for (const [name, entries] of Object.entries(searchEntries.value)) rememberStatuses(entries, name)
  }

  /**
   * What the menu lists for a collection: the loaded pages, plus the search matches that are not among
   * them, so a result stays visible without losing the reader's place in the list.
   */
  function entriesOf(name: string): EponymeCollectionEntryMeta[] {
    const loaded = collectionEntries.value[name] ?? []
    const found = searchEntries.value[name] ?? []
    if (!found.length) return loaded
    const seen = new Set(loaded.map(entry => entry.slug))
    return [...loaded, ...found.filter(entry => !seen.has(entry.slug))]
  }

  const visibleEntries = computed<Record<string, EponymeCollectionEntryMeta[]>>(() => Object.fromEntries(
    Object.keys(collections.value).map(name => [name, entriesOf(name)]),
  ))

  return {
    statuses,
    collectionEntries,
    collectionTotals,
    visibleEntries,
    collections,
    load,
    loadMore,
    hasMore,
    isLoadingMore,
    search,
  }
}
