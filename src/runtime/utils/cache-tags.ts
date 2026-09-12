function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags)].map(tag => tag.replace(/,/g, '').slice(0, 256))
}

/**
 * What a publication purges. The bare `eponyme` tag is included on purpose: it is how a host marks the
 * few responses that every publication invalidates, a sitemap being the obvious one.
 */
export function getEponymeCacheTags(name: string, collection?: { name: string } | string): string[] {
  const collectionName = typeof collection === 'string' ? collection : collection?.name
  const tags = ['eponyme', `eponyme:${name}`]
  if (collectionName) tags.push(`eponyme:${collectionName}`)
  return normalizeTags(tags)
}

/**
 * What a response carries. The bare `eponyme` tag is left out: on every response it would turn each
 * publication into a purge of the whole site, since every purge sends that tag.
 */
export function getEponymeResponseTags(name: string, collection?: { name: string } | string): string[] {
  return normalizeTags(getEponymeCacheTags(name, collection).filter(tag => tag !== 'eponyme'))
}

/** The shape of `nuxt.options.routeRules` this needs, declared so this file stays build-safe. */
type TaggableRouteRules = Record<string, { headers?: Record<string, string> }>

/** Tags the host's public routes with the same tags their API responses carry. */
export function tagPreviewPathRoutes(previewPaths: Record<string, string>, routeRules: TaggableRouteRules) {
  const tagged: Array<{ route: string, tag: string }> = []
  const skipped: Array<{ name: string, path: string, tag: string }> = []
  for (const [name, path] of Object.entries(previewPaths)) {
    if (!path.startsWith('/')) continue
    const isCollection = path.includes(':slug')
    // routeRules match on globs, not on named parameters.
    const route = isCollection ? path.replace(/:slug\b.*$/, '**') : path
    const tags = getEponymeResponseTags(name, isCollection ? name : undefined)
    // A collection served from the root has no prefix to glob, and `/**` would tag the whole site,
    // dashboard and API included: one publication would then purge everything.
    if (route === '/**' || route.startsWith('/**')) {
      skipped.push({ name, path, tag: tags[tags.length - 1]! })
      continue
    }
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
  return { tagged, skipped }
}
