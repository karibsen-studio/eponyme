import { defineEventHandler, getRequestURL } from 'h3'
import { setEponymePrivateCache } from '../utils/eponyme-cache'
import { EPONYME_PREVIEW_QUERY } from '../../utils/preview'

/**
 * Every Eponyme route is uncacheable until it says otherwise.
 *
 * The routes that may be cached are a short, deliberate list — published content, the
 * collection listings, the sitemap — and each calls `setEponymePublicCache` to override
 * this. Everything else carries sessions, drafts, trashed entries, form submissions or
 * the user list, and none of it may ever be stored by a browser or a CDN.
 *
 * Written as a default rather than as a header on each handler so that the dangerous
 * direction is the one that takes effort: a route added later is private until someone
 * decides otherwise, instead of public until someone remembers.
 */
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  // A preview goes through the host's own public route, not through an Eponyme one. The
  // draft itself is fetched from the browser and never reaches this HTML, so this closes a
  // narrower hole: the URL is unique per editor and per load, and nothing downstream should
  // keep a copy of a response nobody else will ever ask for.
  //
  // It is a default, not a guarantee. A route the host put under `swr` or `isr` is stored by
  // nitro whatever this says, which is exactly why unreleased content is never rendered here.
  if (url.searchParams.has(EPONYME_PREVIEW_QUERY)) return setEponymePrivateCache(event)
  if (!url.pathname.startsWith('/api/eponyme')) return
  setEponymePrivateCache(event)
})
