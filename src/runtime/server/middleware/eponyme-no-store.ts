import { defineEventHandler, getRequestURL } from 'h3'
import { setEponymePrivateCache } from '../utils/eponyme-cache'

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
  if (!getRequestURL(event).pathname.startsWith('/api/eponyme')) return
  setEponymePrivateCache(event)
})
