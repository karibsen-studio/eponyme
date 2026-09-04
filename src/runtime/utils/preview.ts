/** Mirrors `EponymeVersionSelector`, redeclared so this stays free of server imports. */
type PreviewVersion = 'draft' | 'published' | number

/**
 * Single source of truth for `previewPaths` semantics, shared by the dashboard preview panel and the
 * server-side sitemap builder so both resolve an entry to the exact same public URL.
 */

/** The slug is URL-encoded. */
export function applyPreviewSlug(path: string, slug: string): string {
  return path.replace(/:slug\b/g, encodeURIComponent(slug))
}

/** Splits `<collection>/<slug>` against the configured collection names. */
export function splitCollectionEntry(collectionNames: string[], name: string): { collection: string, slug: string } | undefined {
  for (const collection of collectionNames) {
    const prefix = `${collection}/`
    if (!name.startsWith(prefix)) continue
    const slug = name.slice(prefix.length)
    if (slug && !slug.includes('/')) return { collection, slug }
  }
}

/**
 * An exact key (a singleton) returns its path unchanged; `<collection>/<slug>` returns
 * `previewPaths[collection]` with `:slug` filled in.
 */
export function resolvePreviewPath(
  previewPaths: Record<string, string>,
  collectionNames: string[],
  name: string,
): string | undefined {
  const exact = previewPaths[name]
  if (exact) return exact

  const entry = splitCollectionEntry(collectionNames, name)
  if (!entry) return undefined
  const pattern = previewPaths[entry.collection]
  if (!pattern || !pattern.includes(':slug')) return undefined
  return applyPreviewSlug(pattern, entry.slug)
}

/** The query parameters that turn a public route into a preview. */
export const EPONYME_PREVIEW_QUERY = '__eponyme_preview'
export const EPONYME_PREVIEW_VERSION_QUERY = '__eponyme_preview_version'
export const EPONYME_PREVIEW_TOKEN_QUERY = '__eponyme_preview_token'

/** Reads `?__eponyme_preview_version=` – `draft` by default, or a numeric history id. */
export function readPreviewVersion(raw: unknown): PreviewVersion {
  if (raw === 'published') return 'published'
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : 'draft'
}

/** Reads the preview query params, unwrapping the repeated-param array form. */
export function readPreviewQuery(query: Record<string, unknown>): { entry: string | undefined, version: unknown } {
  const rawEntry = query[EPONYME_PREVIEW_QUERY]
  const rawVersion = query[EPONYME_PREVIEW_VERSION_QUERY]
  const entry = Array.isArray(rawEntry) ? rawEntry[0] : rawEntry
  const version = Array.isArray(rawVersion) ? rawVersion[0] : rawVersion
  return { entry: entry === undefined || entry === null ? undefined : String(entry), version }
}
