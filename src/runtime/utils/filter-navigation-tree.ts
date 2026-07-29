import Fuse from 'fuse.js'
import type { EponymeNavigationNode } from '../types/eponyme-navigation'

interface SearchItem {
  path: string
  label: string
  searchPath: string
}

/** Fuse compares raw characters, so accents and case are folded away beforehand. */
function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function collect(nodes: EponymeNavigationNode[], items: SearchItem[]) {
  for (const node of nodes) {
    items.push({ path: node.path, label: normalize(node.label), searchPath: normalize(node.path) })
    collect(node.children, items)
  }
}

// Rebuilding the index on every keystroke would be wasted work: the tree only changes
// when the configuration or the loaded collection entries do.
const indexes = new WeakMap<EponymeNavigationNode[], Fuse<SearchItem>>()

function indexOf(nodes: EponymeNavigationNode[]) {
  const cached = indexes.get(nodes)
  if (cached) return cached
  const items: SearchItem[] = []
  collect(nodes, items)
  const fuse = new Fuse(items, {
    keys: ['label', 'searchPath'],
    // Tolerant enough for a typo, strict enough that a short query does not match everything.
    threshold: 0.35,
    // Without this a match near the end of a long label is penalised into irrelevance.
    ignoreLocation: true,
  })
  indexes.set(nodes, fuse)
  return fuse
}

/**
 * Keeps the nodes matching `query`, along with every ancestor needed to reach them.
 * A node matched on its own label keeps all of its children, so selecting a folder
 * shows what it holds. An empty query returns the tree untouched.
 */
export function filterEponymeNavigationTree(
  nodes: EponymeNavigationNode[],
  query: string,
): EponymeNavigationNode[] {
  const term = normalize(query.trim())
  if (!term) return nodes

  const matched = new Set(indexOf(nodes).search(term).map(result => result.item.path))

  function keep(list: EponymeNavigationNode[]): EponymeNavigationNode[] {
    return list.flatMap((node) => {
      if (matched.has(node.path)) return [node]
      const children = keep(node.children)
      return children.length ? [{ ...node, children }] : []
    })
  }

  return keep(nodes)
}
