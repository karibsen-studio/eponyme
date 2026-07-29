import { isDeepStrictEqual } from 'node:util'
import type { EponymeCollectionDefinitionBase, EponymeConfig, EponymeSchema } from '../../types'
import { createDefaultEponymeData } from '../../utils/create-default-eponyme-data'
import { getEponymeCollections, getEponymeSchemas } from '../../utils/get-eponyme-schemas'
import { normalizeSlug } from '../../utils/normalize-slug'
import { applyPreviewSlug } from '../../utils/preview'
import { validateEponymeData, validateEponymePatch, type ValidationErrors, type ValidationMode } from '../../utils/validate-eponyme-data'

export type EponymeAction = 'draft' | 'publish'
export type EponymeVersion = 'draft' | 'published'
/** Either the live draft/published content, or a numeric id from the version history. */
export type EponymeVersionSelector = EponymeVersion | number
export type EponymeStatus = 'draft' | 'published'
export interface EponymeResult {
  data: Record<string, unknown>
  status: EponymeStatus
  publishedAt: string | null
}
export interface EponymeVersionAuthor {
  id: string
  username: string
}
export interface EponymeHistoryEntry {
  id: number
  action: EponymeAction | 'restore'
  status: EponymeStatus
  createdAt: string
  user: EponymeVersionAuthor | null
}
/** Raised when a concurrent write changed the entry between our read and our write. */
export interface EponymeConflict {
  conflict: true
  errors?: never
}
export interface EponymeCollectionEntry<Data extends Record<string, unknown> = Record<string, unknown>> {
  slug: string
  title: string
  data: Data
  status: EponymeStatus
  publishedAt: string | null
  updatedAt: string | null
}

export interface EponymeSitemapEntry {
  loc: string
  lastmod?: string
}

export type EponymeSortDirection = 'asc' | 'desc'

export interface EponymeCollectionQuery {
  take?: number
  skip?: number
  orderBy?: string
  order?: EponymeSortDirection
}

export interface EponymeCollectionPage<Data extends Record<string, unknown> = Record<string, unknown>> {
  entries: EponymeCollectionEntry<Data>[]
  /** Matching entries before `take` and `skip`, so it can drive a pager. */
  total: number
}

export const COLLECTION_METADATA_KEYS = ['updatedAt', 'publishedAt', 'title', 'slug'] as const

export type PrismaEponymeRow = { name: string, data: unknown, updatedAt?: Date | string }
export type PrismaEponymeVersionRow = {
  id: number
  entryName: string
  data: unknown
  action: string
  status: string
  createdAt: Date | string
  userId?: string | null
  user?: { id: string, username: string } | null
}
export type PrismaEponymeClient = {
  eponyme: {
    upsert(args: { where: { name: string }, create: { name: string, data: Record<string, unknown> }, update: { data?: Record<string, unknown> } }): Promise<PrismaEponymeRow>
    update(args: { where: { name: string }, data: { data: Record<string, unknown> } }): Promise<PrismaEponymeRow>
    /** Used as a compare-and-swap: the `updatedAt` guard makes concurrent writes fail instead of overwriting. */
    updateMany(args: { where: { name: string, updatedAt?: Date | string }, data: { data: Record<string, unknown> } }): Promise<{ count: number }>
    create(args: { data: { name: string, data: Record<string, unknown> } }): Promise<PrismaEponymeRow>
    findUnique(args: { where: { name: string } }): Promise<PrismaEponymeRow | null>
    findMany(args: {
      where: { name: { startsWith: string } }
      orderBy: Array<{ updatedAt: 'desc' } | { name: 'asc' }>
    }): Promise<PrismaEponymeRow[]>
    delete(args: { where: { name: string } }): Promise<PrismaEponymeRow>
  }
  eponymeVersion: {
    create(args: { data: { entryName: string, data: Record<string, unknown>, action: string, status: EponymeStatus, userId?: string | null } }): Promise<PrismaEponymeVersionRow>
    findMany(args: { where: { entryName: string }, orderBy: { createdAt: 'desc' }, take: number, include?: { user: true } }): Promise<PrismaEponymeVersionRow[]>
    findUnique(args: { where: { id: number } }): Promise<PrismaEponymeVersionRow | null>
  }
}

interface StoredEponymeState {
  __eponyme: {
    version: 1
    draft: Record<string, unknown>
    published: Record<string, unknown>
    status: EponymeStatus
    publishedAt: string | null
  }
}

export class EponymeService {
  private readonly schemas: Record<string, EponymeSchema>
  private readonly collections: Record<string, EponymeCollectionDefinitionBase>

  constructor(config: EponymeConfig, private readonly client: PrismaEponymeClient) {
    this.schemas = getEponymeSchemas(config)
    this.collections = getEponymeCollections(config)
  }

  getSchema(name: string): EponymeSchema | undefined {
    return this.schemas[name] ?? this.getCollectionEntry(name)?.definition.fields
  }

  getCollection(name: string): EponymeCollectionDefinitionBase | undefined {
    return this.collections[name]
  }

  private getCollectionEntry(name: string): { name: string, slug: string, definition: EponymeCollectionDefinitionBase } | undefined {
    for (const [collectionName, definition] of Object.entries(this.collections)) {
      const prefix = `${collectionName}/`
      if (!name.startsWith(prefix)) continue
      const slug = name.slice(prefix.length)
      if (slug && !slug.includes('/')) return { name: collectionName, slug, definition }
    }
  }

  /** Reconcile every configured eponyme at application startup. */
  async syncAll() {
    await Promise.all(Object.keys(this.schemas).map(name => this.loadState(name)))
  }

  private reconcile(schema: EponymeSchema, value: unknown, mode: ValidationMode): Record<string, unknown> {
    const persisted = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
    const defaults = createDefaultEponymeData(schema) as Record<string, unknown>
    return Object.fromEntries(Object.keys(schema).map((key) => {
      const candidate = key in persisted ? persisted[key] : defaults[key]
      // Errors are keyed by path, so a nested failure shows up as `key.sub` — any key at all
      // means this value is unusable and must fall back to the default.
      const errors = validateEponymeData({ [key]: schema[key]! }, { [key]: candidate }, mode)
      return [key, Object.keys(errors).length ? defaults[key] : candidate]
    }))
  }

  private createState(schema: EponymeSchema, value?: unknown): StoredEponymeState {
    const data = this.reconcile(schema, value ?? createDefaultEponymeData(schema), 'publish')
    return {
      __eponyme: {
        version: 1,
        draft: data,
        published: data,
        status: 'published',
        publishedAt: null,
      },
    }
  }

  private normalizeState(schema: EponymeSchema, value: unknown): StoredEponymeState {
    const stored = getStoredState(value)
    if (!stored) return this.createState(schema, value)
    return {
      __eponyme: {
        version: 1,
        draft: this.reconcile(schema, stored.draft, 'draft'),
        published: this.reconcile(schema, stored.published, 'publish'),
        status: stored.status,
        publishedAt: stored.publishedAt,
      },
    }
  }

  /** Reads the stored state along with the `updatedAt` it was read at, used as the optimistic lock token. */
  private async loadRow(name: string): Promise<{ state: StoredEponymeState, updatedAt?: Date | string } | undefined> {
    const schema = this.getSchema(name)
    if (!schema) return undefined
    const defaults = this.createState(schema)
    const row = this.getCollectionEntry(name)
      ? await this.client.eponyme.findUnique({ where: { name } })
      : await this.client.eponyme.upsert({ where: { name }, create: { name, data: defaults as unknown as Record<string, unknown> }, update: {} })
    if (!row) return undefined
    const state = this.normalizeState(schema, row.data)
    if (sameData(state, row.data)) return { state, updatedAt: row.updatedAt }
    const healed = await this.client.eponyme.update({ where: { name }, data: { data: state as unknown as Record<string, unknown> } })
    return { state, updatedAt: healed.updatedAt ?? row.updatedAt }
  }

  private async loadState(name: string): Promise<StoredEponymeState | undefined> {
    return (await this.loadRow(name))?.state
  }

  /**
   * Writes a new state only if the row still carries the `updatedAt` we read.
   * Returns false when a concurrent editor won the race, so the caller can report a conflict
   * instead of silently discarding their changes.
   */
  private async writeState(name: string, next: StoredEponymeState, expectedUpdatedAt?: Date | string): Promise<boolean> {
    const data = next as unknown as Record<string, unknown>
    if (!expectedUpdatedAt) {
      await this.client.eponyme.update({ where: { name }, data: { data } })
      return true
    }
    const { count } = await this.client.eponyme.updateMany({ where: { name, updatedAt: expectedUpdatedAt }, data: { data } })
    return count > 0
  }

  async get(name: string, version: EponymeVersionSelector = 'published'): Promise<Record<string, unknown> | undefined> {
    return (await this.getResult(name, version))?.data
  }

  async getResult(name: string, version: EponymeVersionSelector = 'published'): Promise<EponymeResult | undefined> {
    // A numeric selector reads a point in history rather than the entry's current state.
    if (typeof version === 'number') return this.getVersionResult(name, version)
    const state = await this.loadState(name)
    if (!state) return undefined
    if (version === 'published' && this.getCollectionEntry(name) && !state.__eponyme.publishedAt) return undefined
    return {
      data: state.__eponyme[version],
      status: state.__eponyme.status,
      publishedAt: state.__eponyme.publishedAt,
    }
  }

  /** Content as it was in a given version, for previewing without restoring it. */
  private async getVersionResult(name: string, versionId: number): Promise<EponymeResult | undefined> {
    const schema = this.getSchema(name)
    if (!schema) return undefined
    const version = await this.client.eponymeVersion.findUnique({ where: { id: versionId } })
    if (!version || version.entryName !== name) return undefined
    const state = this.normalizeState(schema, version.data)
    return {
      data: state.__eponyme.draft,
      status: state.__eponyme.status,
      publishedAt: state.__eponyme.publishedAt,
    }
  }

  async statuses(): Promise<Record<string, EponymeStatus>> {
    const entries = await Promise.all(Object.keys(this.schemas).map(async (name) => {
      const state = await this.loadState(name)
      return [name, state?.__eponyme.status ?? 'published'] as const
    }))
    return Object.fromEntries(entries)
  }

  /** Metadata keys that can be sorted on, alongside every field of the collection. */
  collectionSortKeys(name: string): string[] | undefined {
    const definition = this.collections[name]
    if (!definition) return undefined
    // A field named `title` or `slug` collides with the metadata key of the same
    // name; both resolve to the same value, so one entry is enough.
    return [...new Set([...COLLECTION_METADATA_KEYS, ...Object.keys(definition.fields)])]
  }

  async listCollection(
    name: string,
    version: EponymeVersion = 'published',
    query: EponymeCollectionQuery = {},
  ): Promise<EponymeCollectionPage | undefined> {
    const definition = this.collections[name]
    if (!definition) return undefined
    const rows = await this.client.eponyme.findMany({
      where: { name: { startsWith: `${name}/` } },
      orderBy: [
        { updatedAt: 'desc' },
        { name: 'asc' },
      ],
    })
    const entries = await Promise.all(rows.filter(row => !row.name.slice(name.length + 1).includes('/')).map(async (row) => {
      const slug = row.name.slice(name.length + 1)
      const result = await this.getResult(row.name, version)
      return {
        slug,
        title: String(result?.data[definition.titleField] || slug),
        data: result?.data ?? {},
        status: version === 'published' ? 'published' : result?.status ?? 'draft',
        publishedAt: result?.publishedAt ?? null,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      }
    }))

    // Sorting and slicing happen here rather than in SQL: the publication status
    // lives inside the JSONB envelope, so a database-side `take` would count rows
    // that are filtered out a moment later.
    const visible = version === 'draft' ? entries : entries.filter(entry => entry.publishedAt)
    const sorted = query.orderBy ? sortCollectionEntries(visible, query.orderBy, query.order ?? 'desc') : visible
    const skip = Math.max(0, Math.trunc(query.skip ?? 0) || 0)
    const take = query.take === undefined ? undefined : Math.max(0, Math.trunc(query.take) || 0)

    return {
      entries: take === undefined ? sorted.slice(skip) : sorted.slice(skip, skip + take),
      total: sorted.length,
    }
  }

  /**
   * Builds the public URL list configured by `previewPaths`.
   * Collections are resolved directly from their stored rows so this performs
   * one query per collection rather than one query per entry.
   */
  async getSitemapEntries(previewPaths: Record<string, string>): Promise<EponymeSitemapEntry[]> {
    const groups = await Promise.all(Object.entries(previewPaths).map(async ([name, path]) => {
      const collection = this.collections[name]
      if (!collection) {
        const result = await this.getResult(name, 'published')
        if (!result) return []
        return [withLastmod(path, result.publishedAt)]
      }

      if (!path.includes(':slug'))
        throw new Error(`[Eponyme] previewPaths.${name} must include ":slug" to generate collection sitemap URLs.`)

      const rows = await this.client.eponyme.findMany({
        where: { name: { startsWith: `${name}/` } },
        orderBy: [
          { updatedAt: 'desc' },
          { name: 'asc' },
        ],
      })
      return rows.flatMap((row) => {
        const slug = row.name.slice(name.length + 1)
        if (!slug || slug.includes('/')) return []
        const state = this.normalizeState(collection.fields, row.data)
        if (!state.__eponyme.publishedAt) return []
        return [withLastmod(applyPreviewSlug(path, slug), state.__eponyme.publishedAt)]
      })
    }))

    const entries = new Map<string, EponymeSitemapEntry>()
    for (const entry of groups.flat())
      entries.set(entry.loc, entry)
    return [...entries.values()]
  }

  async createCollectionEntry(
    name: string,
    payload: unknown,
    actorId?: string,
  ): Promise<(EponymeResult & { slug: string, errors?: never }) | { errors: ValidationErrors } | undefined> {
    const definition = this.collections[name]
    if (!definition) return undefined
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { errors: { _form: ['Body must be an object.'] } }

    const input = payload as Record<string, unknown>
    if (!String(input[definition.titleField] || '').trim())
      return { errors: { [definition.titleField]: ['This field is required.'] } }
    const slug = normalizeSlug(String(input[definition.slugField] || input[definition.titleField] || ''))
    if (!slug) return { errors: { [definition.slugField]: ['A slug or title is required.'] } }
    const entryName = `${name}/${slug}`
    if (await this.client.eponyme.findUnique({ where: { name: entryName } }))
      return { errors: { [definition.slugField]: ['This slug is already in use.'] } }

    const defaults = createDefaultEponymeData(definition.fields) as Record<string, unknown>
    const data = { ...defaults, ...input, [definition.slugField]: slug }
    const errors = validateEponymePatch(definition.fields, data, data, 'draft')
    if (Object.keys(errors).length) return { errors }

    const state: StoredEponymeState = {
      __eponyme: {
        version: 1,
        draft: data,
        published: defaults,
        status: 'draft',
        publishedAt: null,
      },
    }
    try {
      await this.client.eponyme.create({ data: { name: entryName, data: state as unknown as Record<string, unknown> } })
    }
    catch (error) {
      // Another request created the same slug between our check and this insert.
      if (isPrismaError(error, 'P2002')) return { errors: { [definition.slugField]: ['This slug is already in use.'] } }
      throw error
    }
    await this.client.eponymeVersion.create({ data: { entryName, data: state as unknown as Record<string, unknown>, action: 'draft', status: 'draft', userId: actorId ?? null } })
    return { slug, data, status: 'draft', publishedAt: null }
  }

  async deleteCollectionEntry(name: string): Promise<boolean> {
    if (!this.getCollectionEntry(name)) return false
    try {
      await this.client.eponyme.delete({ where: { name } })
    }
    catch (error) {
      // Already gone, or deleted by a concurrent request.
      if (isPrismaError(error, 'P2025')) return false
      throw error
    }
    return true
  }

  async patch(
    name: string,
    payload: unknown,
    action: EponymeAction = 'publish',
    actorId?: string,
  ): Promise<(EponymeResult & { errors?: never, conflict?: never }) | { errors: ValidationErrors, conflict?: never } | EponymeConflict | undefined> {
    const schema = this.getSchema(name)
    if (!schema) return undefined
    const row = await this.loadRow(name)
    if (!row) return undefined
    const { state, updatedAt } = row
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { errors: { _form: ['Body must be an object.'] } }

    const collectionEntry = this.getCollectionEntry(name)
    if (collectionEntry && collectionEntry.definition.slugField in payload) {
      const submittedSlug = (payload as Record<string, unknown>)[collectionEntry.definition.slugField]
      if (submittedSlug !== collectionEntry.slug)
        return { errors: { [collectionEntry.definition.slugField]: ['The slug cannot be changed after creation.'] } }
    }

    const data = { ...state.__eponyme.draft, ...(payload as Record<string, unknown>) }
    const patchErrors = validateEponymePatch(schema, payload, data, action)
    const errors = action === 'publish'
      ? mergeErrors(patchErrors, validateEponymeData(schema, data, 'publish'))
      : patchErrors
    if (Object.keys(errors).length) return { errors }

    const publishedAt = action === 'publish' ? new Date().toISOString() : state.__eponyme.publishedAt
    const next: StoredEponymeState = {
      __eponyme: {
        version: 1,
        draft: data,
        published: action === 'publish' ? data : state.__eponyme.published,
        status: action === 'publish' ? 'published' : 'draft',
        publishedAt,
      },
    }
    if (!await this.writeState(name, next, updatedAt)) return { conflict: true }
    await this.client.eponymeVersion.create({
      data: {
        entryName: name,
        data: next as unknown as Record<string, unknown>,
        action,
        status: next.__eponyme.status,
        userId: actorId ?? null,
      },
    })
    return { data, status: next.__eponyme.status, publishedAt }
  }

  async history(name: string, limit = 50): Promise<EponymeHistoryEntry[] | undefined> {
    if (!this.getSchema(name)) return undefined
    const versions = await this.client.eponymeVersion.findMany({
      where: { entryName: name },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { user: true },
    })
    return versions.map(version => ({
      id: version.id,
      action: version.action === 'draft' || version.action === 'publish' ? version.action : 'restore',
      status: version.status === 'draft' ? 'draft' : 'published',
      createdAt: new Date(version.createdAt).toISOString(),
      user: version.user ? { id: version.user.id, username: version.user.username } : null,
    }))
  }

  async restore(name: string, versionId: number, actorId?: string): Promise<EponymeResult | EponymeConflict | undefined> {
    const schema = this.getSchema(name)
    if (!schema) return undefined
    const version = await this.client.eponymeVersion.findUnique({ where: { id: versionId } })
    if (!version || version.entryName !== name) return undefined
    const current = await this.loadRow(name)
    if (!current) return undefined
    const state = this.normalizeState(schema, version.data)
    if (!await this.writeState(name, state, current.updatedAt)) return { conflict: true }
    await this.client.eponymeVersion.create({
      data: {
        entryName: name,
        data: state as unknown as Record<string, unknown>,
        action: 'restore',
        status: state.__eponyme.status,
        userId: actorId ?? null,
      },
    })
    return {
      data: state.__eponyme.draft,
      status: state.__eponyme.status,
      publishedAt: state.__eponyme.publishedAt,
    }
  }
}

function getStoredState(value: unknown): StoredEponymeState['__eponyme'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const envelope = value as Partial<StoredEponymeState> & { __keditor?: StoredEponymeState['__eponyme'] }
  const state = envelope.__eponyme ?? envelope.__keditor
  const valid = Boolean(
    state
    && state.version === 1
    && state.draft && typeof state.draft === 'object' && !Array.isArray(state.draft)
    && state.published && typeof state.published === 'object' && !Array.isArray(state.published)
    && (state.status === 'draft' || state.status === 'published')
    && (state.publishedAt === null || typeof state.publishedAt === 'string'),
  )
  return valid ? state : undefined
}

function mergeErrors(...groups: ValidationErrors[]) {
  const errors: ValidationErrors = {}
  for (const group of groups) {
    for (const [field, messages] of Object.entries(group))
      errors[field] = [...new Set([...(errors[field] ?? []), ...messages])]
  }
  return errors
}

export function isPrismaError(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === code)
}

function sameData(left: unknown, right: unknown) {
  return isDeepStrictEqual(left, right)
}

function sortValue(entry: EponymeCollectionEntry, key: string): unknown {
  if ((COLLECTION_METADATA_KEYS as readonly string[]).includes(key))
    return entry[key as typeof COLLECTION_METADATA_KEYS[number]]
  return entry.data[key]
}

/** True for values that carry no ordering information and belong at the end. */
function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function sortCollectionEntries(
  entries: EponymeCollectionEntry[],
  key: string,
  direction: EponymeSortDirection,
): EponymeCollectionEntry[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => {
    const a = sortValue(left, key)
    const b = sortValue(right, key)

    // Missing values sink to the bottom in both directions, so an article with no
    // date never leads the list just because it sorts as an empty string.
    if (isEmptyValue(a) || isEmptyValue(b)) {
      if (isEmptyValue(a) && isEmptyValue(b)) return left.slug.localeCompare(right.slug)
      return isEmptyValue(a) ? 1 : -1
    }

    if (typeof a === 'number' && typeof b === 'number')
      return (a - b) * factor || left.slug.localeCompare(right.slug)
    if (typeof a === 'boolean' && typeof b === 'boolean')
      return (Number(a) - Number(b)) * factor || left.slug.localeCompare(right.slug)

    return String(a).localeCompare(String(b), undefined, { numeric: true }) * factor
      || left.slug.localeCompare(right.slug)
  })
}

function withLastmod(loc: string, publishedAt: string | null): EponymeSitemapEntry {
  return publishedAt ? { loc, lastmod: publishedAt } : { loc }
}
