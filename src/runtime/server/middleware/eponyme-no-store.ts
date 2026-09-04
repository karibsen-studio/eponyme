import { defineEventHandler, getRequestURL } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { setEponymePrivateCache } from '../utils/eponyme-cache'
import { isEponymeDashboardPath, setEponymeSecurityHeaders } from '../utils/eponyme-security'
import { EPONYME_PREVIEW_QUERY } from '../../utils/preview'

/** Every Eponyme route is uncacheable until it says otherwise, and none of them may be framed. */
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  // A preview goes through the host's own public route, not through an Eponyme one.
  if (url.searchParams.has(EPONYME_PREVIEW_QUERY)) return setEponymePrivateCache(event)

  const dashboardPath = (useRuntimeConfig(event).public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? ''
  const isApi = url.pathname.startsWith('/api/eponyme')
  if (!isApi && !isEponymeDashboardPath(url.pathname, dashboardPath)) return

  setEponymeSecurityHeaders(event)
  // The dashboard is host-rendered and keeps the caching the host chose for it.
  if (isApi) setEponymePrivateCache(event)
})
