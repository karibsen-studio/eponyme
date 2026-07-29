import type { EponymeNavigationNode } from '../types/eponyme-navigation'
import { humanizeLabel } from './humanize-label'

export interface EponymeNavigationTreeInput {
  /** Singleton entry names, `pages/homepage`. Only the keys are read. */
  schemas: Record<string, unknown>
  collections: Record<string, { label?: string }>
  forms: Record<string, { label?: string }>
  /** Entries already loaded per collection, added as leaves under their collection. */
  collectionEntries?: Record<string, Array<{ slug: string, title: string }>>
}

/**
 * Turns the flat, slash-separated names of the configuration into the nested tree the
 * sidebar renders. Intermediate segments become folders, so `pages/homepage` yields a
 * `pages` folder even though nothing declares one.
 */
export function buildEponymeNavigationTree(input: EponymeNavigationTreeInput): EponymeNavigationNode[] {
  const root: EponymeNavigationNode[] = []

  function addPath(pathValue: string, finalKind: EponymeNavigationNode['kind'], configuredLabel?: string) {
    const parts = pathValue.split('/')
    let children = root

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!
      const path = parts.slice(0, index + 1).join('/')
      const last = index === parts.length - 1
      const kind = last ? finalKind : 'folder'
      let node = children.find(item => item.path === path)
      if (!node) {
        node = { kind, path, label: humanizeLabel(part, last ? configuredLabel : undefined), children: [] }
        children.push(node)
      }
      else if (last) {
        // A folder created by an earlier, deeper path turns out to be a real node.
        node.kind = finalKind
        if (configuredLabel) node.label = configuredLabel
      }
      children = node.children
    }
  }

  for (const entry of Object.keys(input.schemas)) addPath(entry, 'entry')
  for (const [name, definition] of Object.entries(input.collections)) {
    addPath(name, 'collection', definition.label)
    for (const entry of input.collectionEntries?.[name] ?? []) addPath(`${name}/${entry.slug}`, 'entry', entry.title)
  }
  for (const [name, definition] of Object.entries(input.forms)) addPath(name, 'form', definition.label)

  return root
}
