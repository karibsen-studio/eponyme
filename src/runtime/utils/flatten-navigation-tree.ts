import type { EponymeNavigationNode } from '../types/eponyme-navigation'

export interface EponymeNavigationRow {
  /** Stable across renders, so a virtualised list can key on it. */
  key: string
  kind: EponymeNavigationNode['kind'] | 'more'
  path: string
  label: string
  depth: number
  /** Set on the nodes that hold children, `undefined` on the leaves. */
  open?: boolean
}

export interface FlattenEponymeNavigationOptions {
  openFolders: string[]
  /** Reveals every folder while a search is active, without touching `openFolders`. */
  forceOpen?: boolean
  /** Collections with entries left to fetch, which get a trailing row to load them. */
  hasMore?: (collection: string) => boolean
}

/**
 * Turns the tree into the flat list of rows the sidebar actually shows: only what is
 * visible, in reading order, with the nesting kept as a `depth`.
 *
 * A virtualised list needs to know how many rows exist and where each one sits without
 * rendering any of them, which nested components cannot answer. Flattening first is what
 * makes a collection of a few thousand entries cost the handful of rows on screen.
 */
export function flattenEponymeNavigationTree(
  nodes: EponymeNavigationNode[],
  options: FlattenEponymeNavigationOptions,
): EponymeNavigationRow[] {
  const rows: EponymeNavigationRow[] = []
  const isOpen = (path: string) => options.forceOpen || options.openFolders.includes(path)

  function walk(list: EponymeNavigationNode[], depth: number) {
    for (const node of list) {
      const collapsible = node.kind === 'folder' || node.kind === 'collection'
      rows.push({
        key: `${node.kind}-${node.path}`,
        kind: node.kind,
        path: node.path,
        label: node.label,
        depth,
        open: collapsible ? isOpen(node.path) : undefined,
      })
      if (!collapsible || !isOpen(node.path)) continue
      walk(node.children, depth + 1)
      if (node.kind === 'collection' && options.hasMore?.(node.path)) {
        rows.push({ key: `more-${node.path}`, kind: 'more', path: node.path, label: '', depth: depth + 1 })
      }
    }
  }

  walk(nodes, 0)
  return rows
}
