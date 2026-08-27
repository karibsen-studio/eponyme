import type { EponymeSchema } from '../types/eponyme'
import type { FieldDefinition } from '../types/field'
import { collectEponymeRelations } from './eponyme-relations'

export interface EponymeIndexRow {
  entryName: string
  version: 'draft' | 'published'
  key: string
  value: string
}

/**
 * Field types a `where` can filter on.
 *
 * The line is drawn at what compares correctly as text, because the index stores every
 * value in one string column:
 * - `date` and `datetime` qualify because validation pins them to fixed-width chronological
 *   forms (`YYYY-MM-DD` and UTC ISO respectively), so alphabetical order is chronological.
 * - `number` does not: `'10'` sorts before `'9'`. Filtering on one needs a typed column,
 *   not a wider list here.
 * - Free text (`string`, `textarea`, `richText`, `url`…) is left out on purpose. Indexing
 *   it would suggest a search engine, and equality on a paragraph is never what is wanted.
 */
const INDEXABLE_TYPES = new Set(['tags', 'checkboxGroup', 'select', 'radio', 'boolean', 'date', 'datetime', 'relation'])

/**
 * Reserved key holding what an entry points at, as `<collection>/<slug>`, at any depth.
 *
 * Separate from the filterable rows above, which only cover top-level fields: refusing to
 * trash an entry someone still references has to see a relation buried in an array too, or
 * the guarantee would hold everywhere except where it matters most.
 *
 * It is not a schema field name, so `isEponymeIndexKey` rejects it and no `where` can reach it.
 */
export const EPONYME_RELATION_INDEX_KEY = '__eponyme:relation'

/**
 * Bumped whenever this module changes what it would store for the same configuration –
 * a wider `INDEXABLE_TYPES`, a different `foldEponymeIndexValue`, another row shape.
 *
 * It lives here rather than in the store because it is only correct if it is edited in the
 * same breath as the rules above. Without it, upgrading the module silently invalidates
 * every stored index row in every host application: no config changed, so nothing would
 * detect it, and filters would keep answering from rows built by the old rules.
 */
const INDEX_ALGORITHM = 3

/**
 * Option keys that describe how a field looks, never what it stores. They are stripped
 * before hashing so renaming a label does not rebuild a collection.
 *
 * The list is a denylist rather than an allowlist on purpose: a new option that affects a
 * stored value is then hashed by default. Forgetting to add one to an allowlist would go
 * unnoticed – the index would simply stop matching the content, silently.
 *
 * It applies at every depth, which is what keeps a `field.select()` from being rebuilt when
 * one of its options is relabelled: only the `value` of a `SelectOption` survives here.
 */
const COSMETIC_OPTION_KEYS = new Set(['label', 'description', 'placeholder'])

/** Rejecting a query on an unknown key beats silently returning the whole collection. */
export function eponymeIndexKeys(schema: EponymeSchema): string[] {
  return Object.keys(schema).filter(name => isIndexable(schema[name]))
}

export function isEponymeIndexKey(schema: EponymeSchema, key: string): boolean {
  return isIndexable(schema[key])
}

function isIndexable(definition: FieldDefinition | undefined): boolean {
  return Boolean(definition && INDEXABLE_TYPES.has(definition.type))
}

/**
 * Deliberately not `schemaFingerprint`, which covers names and types only. That one is the
 * import compatibility contract – widening it would start refusing imports over harmless
 * edits. Here the opposite bias applies: `field.select()` losing an option, or
 * `field.tags({ allowCustom })` being turned off, makes `reconcile` drop stored values, and
 * `defaultValue` decides what an entry missing the field gets indexed with. All of that has
 * to invalidate the index, and none of it changes a name or a type.
 *
 * `validate` and `visibleWhen` are functions, kept as their mere presence: a body cannot be
 * hashed honestly, since a minifier would change it without changing behaviour. Editing a
 * custom validator so that it rejects previously stored values therefore needs a manual
 * `reindexEponymeEntries()`.
 */
export function describeEponymeIndexSchema(schema: EponymeSchema): string {
  const fields = Object.keys(schema)
    .filter(name => isIndexable(schema[name]))
    .sort()
    .map(name => `${name}:${schema[name]!.type}:${stableDescribe(schema[name]!.options)}`)
  return `v${INDEX_ALGORITHM}|${fields.join(',')}`
}

/**
 * Stable, order-independent serialization. Object keys are sorted so that reordering a
 * config never looks like a change, while array order is kept because it is meaningful –
 * the first matching suggestion decides a tag's canonical spelling.
 */
function stableDescribe(value: unknown): string {
  if (typeof value === 'function') return 'fn'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableDescribe).join(',')}]`
  const entries = Object.keys(value as Record<string, unknown>)
    .filter(key => !COSMETIC_OPTION_KEYS.has(key))
    .sort()
    .map(key => `${key}:${stableDescribe((value as Record<string, unknown>)[key])}`)
  return `{${entries.join(',')}}`
}

/**
 * Only top-level fields are covered, which is the same reach as `orderBy`: a field nested
 * in a section, a tab or an array is not addressable by a single key, so neither sorting
 * nor filtering can name one.
 *
 * Draft and published are indexed separately. The dashboard lists drafts and a public page
 * lists published entries, and the two disagree on purpose – one index for both would make
 * an unpublished tag leak into a public listing.
 */
export function buildEponymeIndexRows(
  entryName: string,
  schema: EponymeSchema,
  versions: { draft: Record<string, unknown>, published: Record<string, unknown> },
): EponymeIndexRow[] {
  // A Map rather than an array: a tag list normalized to one spelling can still fold two
  // suggestions onto the same key, and the table's primary key would reject the duplicate.
  const rows = new Map<string, EponymeIndexRow>()
  const add = (version: 'draft' | 'published', key: string, value: string) => {
    rows.set(`${version}\u0000${key}\u0000${value}`, { entryName, version, key, value })
  }
  for (const version of ['draft', 'published'] as const) {
    const data = versions[version]
    for (const [key, definition] of Object.entries(schema)) {
      if (!isIndexable(definition)) continue
      for (const value of indexValues(data[key])) add(version, key, value)
    }
    // Both versions are recorded: a reference held only by a draft still breaks if its target
    // is taken away.
    for (const reference of collectEponymeRelations(schema, data))
      add(version, EPONYME_RELATION_INDEX_KEY, fold(reference.entryName))
  }
  return [...rows.values()]
}

/**
 * The values one field contributes. A multi-valued field yields one row per entry, which is
 * what makes "contains this tag" a lookup instead of a scan.
 *
 * Everything is case-folded: `normalizeEponymeTags` keeps whichever spelling was written
 * first, so `Nuxt` and `nuxt` can both be stored, and a filter that distinguished them would
 * return half a listing without saying so.
 */
function indexValues(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []
  if (typeof value === 'boolean') return [String(value)]
  if (typeof value === 'string') return [fold(value)]
  if (Array.isArray(value)) {
    return value.flatMap(item => (typeof item === 'string' && item.trim() ? [fold(item)] : []))
  }
  return []
}

/** The form both the write path and a query reduce a value to, so they always agree. */
export function foldEponymeIndexValue(value: string): string {
  return fold(value)
}

function fold(value: string): string {
  return value.trim().toLocaleLowerCase()
}
