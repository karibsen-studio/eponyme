/**
 * Single source of truth for Eponyme cache tags, shared by the API responses that carry
 * them, the module that tags the host's page routes at build time, and any purge the host
 * runs on publication. Kept free of server imports so `module.ts` can use it too: a page
 * and its API response must be tagged by the same code, or a purge would drop one and
 * leave the other.
 *
 * A CDN cannot usually be purged by URL – Vercel and Cloudflare both purge by tag – and one
 * entry appears in more than one cached response: its own, its collection's listing, and the
 * page that renders it. Tagging all of them is what lets publishing an article drop the
 * article, the index that lists it, and the HTML a visitor would otherwise keep receiving.
 *
 * A comma is the delimiter every CDN uses for this header, so it is stripped rather than
 * escaped: a tag containing one would silently become two.
 */
export function getEponymeCacheTags(name: string, collection?: { name: string } | string): string[] {
  const collectionName = typeof collection === 'string' ? collection : collection?.name
  const tags = ['eponyme', `eponyme:${name}`]
  if (collectionName) tags.push(`eponyme:${collectionName}`)
  return [...new Set(tags)].map(tag => tag.replace(/,/g, '').slice(0, 256))
}

/** The shape of `nuxt.options.routeRules` this needs, declared so this file stays build-safe. */
type TaggableRouteRules = Record<string, { headers?: Record<string, string> }>

/**
 * Tags the host's public routes with the same tags their API responses carry.
 *
 * A published entry ends up in two caches: the JSON the browser reads, and – as soon as the
 * host puts a route under `swr`, `isr` or `prerender` – the HTML itself. Only the first was
 * tagged, so a purge on publication dropped the JSON and left visitors on the old page.
 * `previewPaths` already declares which route renders which entry, which is exactly the
 * mapping needed to tag the other one, once, at build time.
 *
 * A collection pattern cannot name a slug in a route rule, so its pages carry the
 * collection-level tag: publishing one article purges every article page and the index that
 * lists them. Broader than strictly needed, and never wrong – tagging per entry would mean
 * tracking every entry read during a render, and nitro's request context is not shared
 * across the internal fetch that reads them.
 *
 * A header the host wrote wins: this only fills in what nobody set. Returns what it did, so
 * the module can say it out loud: writing into someone else's `routeRules` is invisible to
 * whoever reads their own config, and an effect nobody can see is one nobody can debug.
 */
export function tagPreviewPathRoutes(previewPaths: Record<string, string>, routeRules: TaggableRouteRules) {
  const tagged: Array<{ route: string, tag: string }> = []
  for (const [name, path] of Object.entries(previewPaths)) {
    if (!path.startsWith('/')) continue
    const isCollection = path.includes(':slug')
    // routeRules match on globs, not on named parameters.
    const route = isCollection ? path.replace(/:slug\b.*$/, '**') : path
    const tags = getEponymeCacheTags(name, isCollection ? name : undefined)
    const value = tags.join(',')
    const existing = routeRules[route] ?? {}
    routeRules[route] = {
      ...existing,
      headers: {
        // Vercel reads its own header; `Cache-Tag` is what Cloudflare and Fastly-style CDNs read.
        'Vercel-Cache-Tag': value,
        'Cache-Tag': value,
        ...existing.headers,
      },
    }
    // The entry-specific tag cannot appear on a glob, so report the one that will.
    tagged.push({ route, tag: tags[tags.length - 1]! })
  }
  return tagged
}
