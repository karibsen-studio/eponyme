import type { EponymeConfig } from '../types'
import { getEponymeCollections, getEponymeForms, getEponymeSchemas } from './get-eponyme-schemas'

/** What the router hands back for a path, narrowed to what a redirect has to look at. */
export interface ResolvedRedirect {
  name?: string | symbol | null
  params: Record<string, unknown>
}

/**
 * A login sends the visitor back where they came from, but an entry can be renamed or dropped
 * while a bookmark still points at it - so an unknown target lands on the dashboard root
 * rather than on a 404. The detail route is a catch-all, so matching it is not enough: its
 * name still has to be declared in the config.
 */
export function resolveLoginRedirect(
  redirect: unknown,
  dashboardPath: string,
  config: EponymeConfig,
  resolve: (path: string) => ResolvedRedirect,
): string {
  const base = dashboardPath.replace(/\/$/, '')
  const target = Array.isArray(redirect) ? redirect[0] : redirect
  if (typeof target !== 'string' || !target.startsWith(`${base}/`)) return base

  const resolved = resolve(target)
  if (!resolved.name || resolved.name === 'eponyme-login') return base
  if (resolved.name !== 'eponyme-detail') return target

  const name = resolved.params.eponyme
  const path = Array.isArray(name) ? name.join('/') : String(name ?? '')
  return path && entryExists(config, path) ? target : base
}

/** Mirrors what the detail page accepts: a singleton, a collection and its entries, a form, a folder. */
function entryExists(config: EponymeConfig, name: string) {
  const schemas = getEponymeSchemas(config)
  const collections = getEponymeCollections(config)
  const forms = getEponymeForms(config)
  if (schemas[name] || collections[name] || forms[name]) return true

  const isCollectionEntry = Object.keys(collections).some((collection) => {
    const prefix = `${collection}/`
    return name.startsWith(prefix) && !name.slice(prefix.length).includes('/')
  })
  if (isCollectionEntry) return true

  const declared = [...Object.keys(schemas), ...Object.keys(collections), ...Object.keys(forms)]
  return declared.some(entry => entry.startsWith(`${name}/`))
}
