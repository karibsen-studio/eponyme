import type { TagsFieldOptions } from '../types/field'

/**
 * The canonical form of a tag list, shared by the validation the server enforces, the editor
 * field, and the write path that stores the value.
 *
 * A tag list is a taxonomy, so `Nuxt` and ` nuxt ` are the same tag and must not both exist.
 * The first spelling wins, and a suggestion counts as a first spelling: typing `nuxt` next to a
 * declared `Nuxt` yields `Nuxt`, which keeps a listing from splitting in two.
 */
export function normalizeEponymeTags(value: unknown, options: TagsFieldOptions = {}): string[] {
  if (!Array.isArray(value)) return []
  const suggestions = new Map((options.suggestions ?? []).map(tag => [fold(tag), tag as string]))
  const seen = new Map<string, string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const tag = item.trim()
    if (!tag) continue
    const key = fold(tag)
    if (seen.has(key)) continue
    seen.set(key, suggestions.get(key) ?? tag)
  }
  return [...seen.values()]
}

/** Case-folded so two spellings of one tag collide. */
function fold(tag: string): string {
  return tag.trim().toLocaleLowerCase()
}
