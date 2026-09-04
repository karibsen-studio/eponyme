/**
 * Single source of truth for Eponyme cache tags, shared by the API responses that carry them, the module
 * that tags the host's page routes at build time, and any purge the host runs on publication.
 */
export function getEponymeCacheTags(name: string, collection?: { name: string } | string): string[] {
  const collectionName = typeof collection === 'string' ? collection : collection?.name
  const tags = ['eponyme', `eponyme:${name}`]
  if (collectionName) tags.push(`eponyme:${collectionName}`)
  return [...new Set(tags)].map(tag => tag.replace(/,/g, '').slice(0, 256))
}

/** The shape of `nuxt.options.routeRules` this needs, declared so this file stays build-safe. */
type TaggableRouteRules = Record<string, { headers?: Record<string, string> }>

/** Tags the host's public routes with the same tags their API responses carry. */
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
