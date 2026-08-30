import { t } from '#eponyme/locale'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { EponymeAction, EponymeCollectionDefinitionBase, EponymeConfig, EponymeSchema, EponymeStatus } from '../../types'
import type { FieldDefinition } from '../../types/field'
import { createDefaultEponymeData } from '../../utils/create-default-eponyme-data'
import { isArrayItemFieldDefinition } from '../../utils/get-field-default-value'
import { getEponymeCollections, getEponymeSchemas } from '../../utils/get-eponyme-schemas'
import { normalizeSlug } from '../../utils/normalize-slug'
import { applyPreviewSlug } from '../../utils/preview'
import { validateEponymeData, validateEponymePatch, type ValidationErrors, type ValidationMode } from '../../utils/validate-eponyme-data'
import { normalizeEponymeValues } from '../../utils/normalize-eponyme-values'
import { eponymeRichTextRejections } from '../../utils/sanitize-rich-text'
import { collectEponymeRelations } from '../../utils/eponyme-relations'
import { EPONYME_RELATION_INDEX_KEY, buildEponymeIndexRows, describeEponymeIndexSchema, eponymeIndexKeys, foldEponymeIndexValue, type EponymeIndexRow } from '../../utils/eponyme-entry-index'
import { EponymeCache, type EponymeSharedCacheStorage } from './eponyme-cache-store'

export type { EponymeAction, EponymeStatus } from '../../types'
export type EponymeVersion = 'draft' | 'published'
/** Either the live draft/published content, or a numeric id from the version history. */
export type EponymeVersionSelector = EponymeVersion | number
export interface EponymeSchedule {
  scheduledPublishAt?: string | null
  scheduledUnpublishAt?: string | null
}
export interface EponymeResult {
  data: Record<string, unknown>
  status: EponymeStatus
  publishedAt: string | null
  scheduledPublishAt: string | null
  scheduledUnpublishAt: string | null
  /**
   * The optimistic lock token, sent back with the next write of this entry.
   *
   * Only set where it can be trusted: a private read straight from the database. A published
   * read is served from the row cache, whose `updatedAt` may lag, and a version read describes
   * a point in history rather than the row a writer would lock on - both answer `null`.
   */
  revision: string | null
}
export interface EponymeVersionAuthor {
  id: string
  username: string
}
export type EponymeActor = EponymeVersionAuthor
export interface EponymeHistoryEntry {
  id: number
  action: EponymeAction | 'restore' | 'import'
  status: EponymeStatus
  createdAt: string
  user: EponymeVersionAuthor | null
}
/** Raised when a concurrent write changed the entry between our read and our write. */
export interface EponymeConflict {
  conflict: true
  errors?: never
}
export interface EponymeScheduleTransition extends EponymeResult {
  name: string
  action: 'publish' | 'unpublish'
}
export interface EponymeCollectionEntry<Data extends Record<string, unknown> = Record<string, unknown>> {
  slug: string
  title: string
  data: Data
  status: EponymeStatus
  publishedAt: string | null
  scheduledPublishAt: string | null
  scheduledUnpublishAt: string | null
  updatedAt: string | null
  /** Only set for entries read from the trash. */
  deletedAt?: string | null
}

export interface EponymeSitemapEntry {
  loc: string
  lastmod?: string
}

/** One entry of an export file: the complete stored state, without the envelope. */
export interface EponymeExportEntry {
  name: string
  /** Set for collection entries, so a reader can group them without re-parsing the name. */
  collection?: string
  draft: Record<string, unknown>
  published: Record<string, unknown>
  status: EponymeStatus
  publishedAt: string | null
  scheduledPublishAt: string | null
  scheduledUnpublishAt: string | null
}

export interface EponymeExportFile {
  eponyme: {
    format: 1
    exportedAt: string
    /** Schema fingerprint per singleton and per collection, checked before an import writes anything. */
    schemas: Record<string, string>
  }
  entries: EponymeExportEntry[]
}

export interface EponymeImportResult {
  dryRun: boolean
  created: number
  updated: number
  skipped: Array<{ name: string, reason: string }>
}

/** An entry the import actually wrote, as the hooks the route emits need to describe it. */
export interface EponymeImportedEntry extends EponymeResult {
  name: string
  collection?: { name: string, slug: string }
  /** Whether the entry was published before the import, so the route can emit an unpublication. */
  wasPublished: boolean
}

/**
 * What the store hands back. `written` stays on the server: the route reads it to emit its
 * hooks and answers with the counts alone, which is all the dashboard shows.
 */
export interface EponymeImportOutcome extends EponymeImportResult {
  written: EponymeImportedEntry[]
}

/** The import was refused as a whole, before any write. */
export interface EponymeImportRejection {
  errors: string[]
  /** Names whose configured schema differs from the one the file was exported with. */
  schemaMismatch?: string[]
}

export type EponymeSortDirection = 'asc' | 'desc'

/** Comparisons a filter may ask for. Only fields stored in a sortable text form accept one. */
export interface EponymeFilterRange {
  gte?: string
  lte?: string
  gt?: string
  lt?: string
}

export interface EponymeFilterOperators extends EponymeFilterRange {
  in?: string[]
  /** Excluded values. Resolved by subtraction: the index only records what is there. */
  not?: string[]
  contains?: string
}

/**
 * One condition of a `where`. A list means "any of these", so the values of one key are
 * ORed together while the keys themselves are ANDed.
 */
export type EponymeFilterCondition = string | string[] | EponymeFilterOperators

export interface EponymeCollectionQuery {
  take?: number
  skip?: number
  orderBy?: string
  order?: EponymeSortDirection
  /** Keyed by field name. Only the keys `collectionFilterKeys` reports can be used. */
  where?: Record<string, EponymeFilterCondition>
  /**
   * Substring of the title or of the slug. Titles live in the JSON payload, so a search
   * reads the matching set the way sorting by title already does.
   */
  search?: string
}

export interface EponymeCollectionPage<Data extends Record<string, unknown> = Record<string, unknown>> {
  entries: EponymeCollectionEntry<Data>[]
  /** Matching entries before `take` and `skip`, so it can drive a pager. */
  total: number
}

export const COLLECTION_METADATA_KEYS = ['updatedAt', 'publishedAt', 'title', 'slug'] as const

/**
 * How long an import may hold its transaction. The route caps the body at 5 MB, so this
 * bounds the work rather than guessing at it, and it stays well under a proxy timeout.
 */
const IMPORT_TRANSACTION_MS = 120_000

/**
 * A content row. Everything but the name is optional because a query narrows what it reads –
 * a public listing selects `published` and never `draft` – and a narrowed row has to satisfy
 * this type as it is, without an overload per shape.
 */
export type PrismaEponymeRow = {
  name: string
  draft?: unknown
  published?: unknown
  status?: string
  publishedAt?: Date | string | null
  scheduledPublishAt?: Date | string | null
  scheduledUnpublishAt?: Date | string | null
  updatedAt?: Date | string
  deletedAt?: Date | string | null
}

export type EponymeRowWrite = {
  draft: Record<string, unknown>
  published: Record<string, unknown>
  status: EponymeStatus
  publishedAt: Date | null
  scheduledPublishAt: Date | null
  scheduledUnpublishAt: Date | null
}

export type PrismaEponymeSelect = {
  name?: true
  draft?: true
  published?: true
  status?: true
  publishedAt?: true
  scheduledPublishAt?: true
  scheduledUnpublishAt?: true
  updatedAt?: true
}

export type PrismaEponymeWhere = {
  /** `in` is what a filtered listing uses: the index resolves the names first. */
  name?: string | { startsWith: string } | { in: string[] }
  deletedAt?: PrismaDeletedAtFilter
  publishedAt?: { not: null }
  status?: EponymeStatus
  scheduledPublishAt?: null | { lte: Date }
  scheduledUnpublishAt?: null | { gt: Date } | { lte: Date }
  AND?: PrismaEponymeWhere[]
  OR?: PrismaEponymeWhere[]
}

export type PrismaEponymeQuery = {
  where: PrismaEponymeWhere
  orderBy?: PrismaEponymeOrderBy[]
  take?: number
  skip?: number
}

/**
 * `nulls` appears on `publishedAt` alone: Prisma refuses it on a column that cannot be null,
 * and `updatedAt` never is. A test double cannot catch that – only the real client does.
 */
export type PrismaEponymeOrderBy
  = | { name: 'asc' }
    | { updatedAt: EponymeSortDirection }
    | { publishedAt: { sort: EponymeSortDirection, nulls: 'last' } }

/** `null` keeps the live rows, `{ not: null }` the trashed ones. */
export type PrismaDeletedAtFilter = null | { not: null }
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
/**
 * The model delegates, which a transaction exposes just like the client does.
 * They are named on their own because Prisma hands an interactive transaction a client
 * stripped of `$transaction`, so the callback cannot be typed as the full client.
 */
export type PrismaEponymeDelegates = {
  eponyme: {
    upsert(args: { where: { name: string }, create: EponymeRowWrite & { name: string }, update: Partial<EponymeRowWrite> }): Promise<PrismaEponymeRow>
    update(args: { where: { name: string }, data: EponymeRowWrite }): Promise<PrismaEponymeRow>
    /** Used as a compare-and-swap: the `updatedAt` guard makes concurrent writes fail instead of overwriting. */
    updateMany(args: {
      where: { name: string, updatedAt?: Date | string, deletedAt?: PrismaDeletedAtFilter }
      data: Partial<EponymeRowWrite> & { deletedAt?: Date | null }
    }): Promise<{ count: number }>
    create(args: { data: EponymeRowWrite & { name: string } }): Promise<PrismaEponymeRow>
    findUnique(args: { where: { name: string } }): Promise<PrismaEponymeRow | null>
    /**
     * One signature rather than an overload per `select`: every column of
     * `PrismaEponymeRow` but `name` is optional, so a narrowed row satisfies it as it is.
     */
    findMany(args: PrismaEponymeQuery & { select?: PrismaEponymeSelect }): Promise<PrismaEponymeRow[]>
    count(args: PrismaEponymeQuery): Promise<number>
    delete(args: { where: { name: string } }): Promise<PrismaEponymeRow>
  }
  eponymeVersion: {
    create(args: { data: { entryName: string, data: Record<string, unknown>, action: string, status: EponymeStatus, userId?: string | null } }): Promise<PrismaEponymeVersionRow>
    findMany(args: { where: { entryName: string }, orderBy: { createdAt: 'desc' }, take: number, include?: { user: true } }): Promise<PrismaEponymeVersionRow[]>
    findUnique(args: { where: { id: number } }): Promise<PrismaEponymeVersionRow | null>
  }
  eponymeEntryIndex: {
    /** The rows of an entry are replaced as a whole, so a removed value cannot survive. */
    deleteMany(args: { where: { entryName: string | { startsWith: string } } }): Promise<{ count: number }>
    createMany(args: { data: EponymeIndexRow[] }): Promise<{ count: number }>
    findMany(args: {
      where: {
        /** Absent when the question is "who points at this", which spans every collection. */
        entryName?: { startsWith: string }
        version?: 'draft' | 'published'
        key: string
        value: PrismaStringFilter
      }
      select: { entryName: true }
    }): Promise<Array<{ entryName: string }>>
  }
  eponymeIndexState: {
    findMany(): Promise<Array<{ name: string, fingerprint: string }>>
    upsert(args: {
      where: { name: string }
      create: { name: string, fingerprint: string }
      update: { fingerprint: string }
    }): Promise<{ name: string, fingerprint: string }>
    deleteMany(args: { where: { name: { in: string[] } } }): Promise<{ count: number }>
  }
  eponymeAuditEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>
  }
}

/**
 * What one condition asks the index for. Text order is the point: a range only makes sense
 * because every indexed value is stored in a form whose alphabetical order is its natural
 * one – see `buildEponymeIndexRows`.
 */
export type PrismaStringFilter = string | {
  in?: string[]
  /** Substring match. A leading wildcard cannot use the index's ordering, so this scans. */
  contains?: string
  gte?: string
  lte?: string
  gt?: string
  lt?: string
}

export type PrismaEponymeClient = PrismaEponymeDelegates & {
  /**
   * Prisma's interactive transaction. Writes that only make sense together – an entry and
   * its history version, an import and every version it writes – run inside one, so a
   * failure between the two rolls back instead of leaving the history disagreeing with
   * the content it describes.
   */
  $transaction<T>(
    fn: (tx: PrismaEponymeDelegates) => Promise<T>,
    options?: { maxWait?: number, timeout?: number },
  ): Promise<T>
}

interface StoredEponymeState {
  __eponyme: {
    version: 1
    draft: Record<string, unknown>
    published: Record<string, unknown>
    status: EponymeStatus
    publishedAt: string | null
    scheduledPublishAt: string | null
    scheduledUnpublishAt: string | null
  }
}

export class EponymeService {
  private readonly schemas: Record<string, EponymeSchema>
  private readonly collections: Record<string, EponymeCollectionDefinitionBase>
  /** Entries a read has already persisted the normalized shape for, so it only attempts it once. */
  private readonly healedByRead = new Set<string>()
  /** `<name>\n<revision>` a heal superseded, mapped to the revision it wrote in its place. */
  private readonly healedRevisions = new Map<string, string>()
  /**
   * Read-path cache of normalized rows, so a page that reads the same entry from a
   * singleton, a listing and a layout pays one round trip instead of one per read.
   * Writers never read from it, so the `updatedAt` they lock on always comes from the
   * database and a stale key can never turn into a spurious conflict.
   */
  private readonly cache: EponymeCache

  constructor(
    config: EponymeConfig,
    private readonly client: PrismaEponymeClient,
    options: {
      cacheSeconds?: number
      cacheStorage?: string
      resolveCacheStorage?: (mount: string) => EponymeSharedCacheStorage
    } = {},
  ) {
    this.schemas = getEponymeSchemas(config)
    this.collections = getEponymeCollections(config)
    const mount = options.cacheStorage?.trim()
    this.cache = new EponymeCache({
      cacheSeconds: options.cacheSeconds,
      storage: mount && options.resolveCacheStorage
        ? () => options.resolveCacheStorage?.(mount)
        : undefined,
    })
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    return this.cache.get(key, load)
  }

  /**
   * Drops what a write to `name` invalidates: the entry itself, and the listing of the
   * collection that contains it, whose row set just changed.
   */
  private async invalidate(name: string) {
    const collection = this.getCollectionEntry(name)?.name
    await Promise.all([
      this.cache.drop(`row:${name}`),
      // A prefix rather than an exact key: a listing is cached per version, and after the
      // column split per selected shape, so one write has to drop all of them.
      collection ? this.cache.dropPrefix(`rows:${collection}`) : undefined,
    ])
  }

  /**
   * Replaces an entry's filterable values, in the same transaction as the write that
   * changed them.
   *
   * Deleting before inserting rather than diffing: an entry carries a handful of rows, the
   * two statements are cheap, and a diff is one more place for the index to drift from the
   * content it describes – a failure mode that returns wrong listings without erroring.
   */
  private async reindexEntry(db: PrismaEponymeDelegates, name: string, state: StoredEponymeState): Promise<void> {
    const schema = this.getSchema(name)
    if (!schema) return
    await db.eponymeEntryIndex.deleteMany({ where: { entryName: name } })
    const rows = buildEponymeIndexRows(name, schema, state.__eponyme)
    if (rows.length) await db.eponymeEntryIndex.createMany({ data: rows })
  }

  private async audit(
    db: PrismaEponymeDelegates,
    actor: string | EponymeActor | undefined,
    action: string,
    resourceType: 'singleton' | 'collection' | 'system',
    resourceName: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const resolvedActor = typeof actor === 'string' ? { id: actor, username: null } : actor
    await db.eponymeAuditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: resolvedActor?.id ?? null,
        actorUsername: resolvedActor?.username ?? null,
        action,
        outcome: 'success',
        resourceType,
        resourceName,
        metadata: metadata ?? null,
      },
    })
  }

  collectionFilterKeys(name: string): string[] | undefined {
    const definition = this.collections[name]
    return definition ? eponymeIndexKeys(definition.fields) : undefined
  }

  /**
   * One transaction per entry rather than one for the whole collection: a collection has no
   * bound, and a single transaction over it would exceed Prisma's timeout on anything real.
   * The unit that has to be atomic is the entry, and it is.
   */
  private async reindexName(name: string): Promise<number> {
    const definition = this.collections[name]
    if (!definition) {
      const state = await this.loadState(name)
      if (!state) return 0
      await this.transaction(async tx => await this.reindexEntry(tx, name, state))
      return 1
    }

    let entries = 0
    for (const row of await this.liveCollectionRows(name)) {
      const slug = row.name.slice(name.length + 1)
      if (!slug || slug.includes('/')) continue
      const state = this.rowToState(definition.fields, row)
      await this.transaction(async tx => await this.reindexEntry(tx, row.name, state))
      entries++
    }
    return entries
  }

  private indexedNames(): string[] {
    return [...Object.keys(this.schemas), ...Object.keys(this.collections)]
  }

  /**
   * The unconditional rebuild, for a first backfill or a manual repair. It refreshes the
   * recorded fingerprints too, so a repair does not leave the next boot with work to redo.
   */
  async reindexAll(): Promise<{ entries: number }> {
    let entries = 0
    for (const name of this.indexedNames()) {
      entries += await this.reindexName(name)
      await this.writeIndexState(name)
    }
    return { entries }
  }

  /**
   * Rebuilds only what a configuration change invalidated, and nothing when nothing changed.
   *
   * This is what makes the index self-maintaining. Ordinary writes keep it current, but a
   * newly filterable field leaves the entries already stored without any row for that key –
   * and a filter on them then answers "none" rather than failing, which is the worst way for
   * this to break.
   *
   * Unchanged configuration costs one read of a table with one row per collection.
   */
  async syncIndexState(): Promise<{ reindexed: string[] }> {
    const recorded = new Map((await this.client.eponymeIndexState.findMany()).map(row => [row.name, row.fingerprint]))
    const reindexed: string[] = []

    for (const name of this.indexedNames()) {
      if (recorded.get(name) === this.indexFingerprint(name)) continue
      await this.reindexName(name)
      // Written only once the whole name succeeded. A crash partway leaves it absent, so the
      // next boot retries; every individual entry was still rebuilt atomically.
      await this.writeIndexState(name)
      reindexed.push(name)
    }

    // A collection removed from the config keeps neither rows nor a fingerprint. Its content
    // is untouched – only the record of an index that no longer describes anything.
    const stale = [...recorded.keys()].filter(name => !this.schemas[name] && !this.collections[name])
    if (stale.length) await this.client.eponymeIndexState.deleteMany({ where: { name: { in: stale } } })

    return { reindexed }
  }

  private indexFingerprint(name: string): string {
    const schema = this.collections[name]?.fields ?? this.schemas[name]
    return createHash('sha256').update(describeEponymeIndexSchema(schema ?? {})).digest('hex').slice(0, 32)
  }

  private async writeIndexState(name: string): Promise<void> {
    const fingerprint = this.indexFingerprint(name)
    await this.client.eponymeIndexState.upsert({
      where: { name },
      create: { name, fingerprint },
      update: { fingerprint },
    })
  }

  /**
   * Runs writes that have to land together, then drops what they invalidated.
   *
   * The callback reports the entries it touched rather than invalidating them itself:
   * inside the transaction the write has not landed yet, and a read racing an
   * uncommitted change would re-cache the old row and hold it for the whole TTL. The
   * drop is deliberate on a rollback too – losing a cache entry costs one query, while
   * keeping a wrong one costs the TTL.
   */
  private async transaction<T>(
    fn: (tx: PrismaEponymeDelegates, invalidate: (name: string) => void) => Promise<T>,
    options?: { maxWait?: number, timeout?: number },
  ): Promise<T> {
    const touched = new Set<string>()
    try {
      return await this.client.$transaction(tx => fn(tx, name => touched.add(name)), options)
    }
    finally {
      // Awaited, so the shared tier has actually dropped the keys before the caller, and the
      // response it is about to send, lets a reader repopulate them.
      await Promise.all([...touched].map(name => this.invalidate(name)))
    }
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

  /** Reconcile every configured eponyme at application startup. This is the one place that heals. */
  /** Reconcile and normalise every stored row at startup, including trashed collection entries. */
  async syncAll() {
    await Promise.all(Object.keys(this.schemas).map(name => this.loadState(name, { heal: true })))

    for (const [collectionName, definition] of Object.entries(this.collections)) {
      const rows = await this.client.eponyme.findMany({
        where: { name: { startsWith: `${collectionName}/` } },
      })
      for (const row of rows) {
        const slug = row.name.slice(collectionName.length + 1)
        if (!slug || slug.includes('/')) continue
        const state = this.rowToState(definition.fields, row)
        if (sameRow(state, row)) continue
        // The walk is as long as the collection, and the application is already serving
        // writes while it runs: an entry saved mid-walk keeps its save.
        await this.healRow(row.name, state, row.updatedAt)
      }
    }
  }

  /**
   * Brings a stored document back in line with the schema: keys the schema no longer declares
   * are dropped, and a key it declares but the document lacks takes its default.
   *
   * Recursive, because a field added inside a section, a tab or an array item is otherwise
   * never filled in: the container it lives in already exists and is still valid, so a
   * top-level pass keeps it untouched and the new field reads as missing forever. That was
   * silent – `defaultValue` simply did nothing for anything but a root field.
   */
  private reconcile(schema: EponymeSchema, value: unknown, mode: ValidationMode): Record<string, unknown> {
    const persisted = isPlainObject(value) ? value : {}
    const defaults = createDefaultEponymeData(schema) as Record<string, unknown>
    return Object.fromEntries(Object.keys(schema).map((key) => {
      const definition = schema[key]!
      const candidate = Object.hasOwn(persisted, key)
        ? this.reconcileField(definition, persisted[key], mode)
        : defaults[key]
      // Errors are keyed by path, so a nested failure shows up as `key.sub` – any key at all
      // means this value is unusable and must fall back to the default.
      const errors = validateEponymeData({ [key]: definition }, { [key]: candidate }, mode)
      return [key, Object.keys(errors).length ? defaults[key] : candidate]
    }))
  }

  /** Descends into the containers; a leaf is returned untouched for `reconcile` to judge. */
  private reconcileField(definition: FieldDefinition, value: unknown, mode: ValidationMode): unknown {
    if (definition.type === 'section')
      return isPlainObject(value) ? this.reconcile(definition.options.fields, value, mode) : value

    if (definition.type === 'tabs') {
      if (!isPlainObject(value)) return value
      return Object.fromEntries(Object.entries(definition.options.tabs).map(([tabName, tab]) => [
        tabName,
        this.reconcile(tab.fields, value[tabName], mode),
      ]))
    }

    if (definition.type === 'array') {
      const of = definition.options.of
      // An array of leaves has nothing to fill in; only item schemas gain fields.
      if (!Array.isArray(value) || isArrayItemFieldDefinition(of)) return value
      return value.map(item => isPlainObject(item) ? this.reconcile(of, item, mode) : item)
    }

    return value
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
        scheduledPublishAt: null,
        scheduledUnpublishAt: null,
      },
    }
  }

  /**
   * Reads a state out of an envelope. Live content is in columns now, so this serves the two
   * places an envelope still exists: a history row, which deliberately keeps the old shape so
   * that versions written before this change stay restorable, and an import, which rebuilds
   * one from the portable file.
   */
  private normalizeState(schema: EponymeSchema, value: unknown): StoredEponymeState {
    const stored = getStoredState(value)
    if (!stored) return this.createState(schema, value)
    // Normalised as well as reconciled: an import and a restore write content this server
    // never validated on the way in, and they must land under the same rules as a save.
    return {
      __eponyme: {
        version: 1,
        draft: normalizeEponymeValues(schema, this.reconcile(schema, stored.draft, 'draft')),
        published: shouldKeepEmptyPublished(stored) ? {} : normalizeEponymeValues(schema, this.reconcile(schema, stored.published, 'publish')),
        status: stored.status,
        publishedAt: stored.publishedAt,
        scheduledPublishAt: stored.scheduledPublishAt,
        scheduledUnpublishAt: stored.scheduledUnpublishAt,
      },
    }
  }

  private rowToState(schema: EponymeSchema, row: PrismaEponymeRow): StoredEponymeState {
    const status = toEponymeStatus(row.status)
    const publishedAt = toIsoOrNull(row.publishedAt)
    return {
      __eponyme: {
        version: 1,
        draft: normalizeEponymeValues(schema, this.reconcile(schema, row.draft, 'draft')),
        published: status === 'draft' && publishedAt === null && isEmptyPlainObject(row.published)
          ? {}
          : normalizeEponymeValues(schema, this.reconcile(schema, row.published, 'publish')),
        status,
        publishedAt,
        scheduledPublishAt: toIsoOrNull(row.scheduledPublishAt),
        scheduledUnpublishAt: toIsoOrNull(row.scheduledUnpublishAt),
      },
    }
  }

  /**
   * A singleton row is created on first read, but only when it is genuinely missing.
   * An `upsert` would send a write on every read instead, and each one costs a database
   * round trip on the critical path of a public page.
   */
  private async loadSingletonRow(name: string, schema: EponymeSchema): Promise<PrismaEponymeRow | null> {
    const row = await this.client.eponyme.findUnique({ where: { name } })
    if (row) return row
    try {
      return await this.client.eponyme.create({ data: { name, ...stateToColumns(this.createState(schema)) } })
    }
    catch (error) {
      // A concurrent request created the row between our read and our insert.
      if (isPrismaError(error, 'P2002')) return await this.client.eponyme.findUnique({ where: { name } })
      throw error
    }
  }

  /**
   * Reads the stored state along with the `updatedAt` it was read at, used as the optimistic lock token.
   *
   * `heal` persists the normalized state when it differs from what is stored. It has to stay on for
   * writers, because healing moves `updatedAt` and so decides the lock token they are about to compare.
   *
   * `cache` is only ever set for published content. Draft reads serve the preview panel, which has to
   * show a save immediately, and they come from the dashboard rather than from a public page – so
   * there is nothing to gain by caching them and a stale preview to lose.
   */
  private async loadRow(
    name: string,
    { heal = false, cache = false }: { heal?: boolean, cache?: boolean } = {},
  ): Promise<{ state: StoredEponymeState, updatedAt?: Date | string } | undefined> {
    if (!cache || heal) return await this.readRow(name, heal)
    return await this.cached(`row:${name}`, () => this.readRow(name, false))
  }

  private async readRow(name: string, heal: boolean): Promise<{ state: StoredEponymeState, updatedAt?: Date | string } | undefined> {
    const schema = this.getSchema(name)
    if (!schema) return undefined
    const row = this.getCollectionEntry(name)
      ? await this.client.eponyme.findUnique({ where: { name } })
      : await this.loadSingletonRow(name, schema)
    // A trashed entry reads as missing everywhere: this is the single gate every
    // reader goes through, so nothing has to remember to filter it out.
    if (!row || row.deletedAt) return undefined
    const state = this.rowToState(schema, row)
    if (sameRow(state, row)) return { state, updatedAt: row.updatedAt }
    // The stored shape drifted from the configured one – a storage-envelope migration, or a
    // field that no longer validates. Persisting it converges, so a reader does it once per
    // process: the migration still lands on first read, but a drift that never converges
    // cannot turn every later read of a public page into a write.
    if (!heal && this.healedByRead.has(name)) return { state, updatedAt: row.updatedAt }
    const healed = await this.healRow(name, state, row.updatedAt)
    // Answering with the token that was read, not a fresh one: a writer that lost this race
    // has to see the conflict rather than write over the content that won it.
    if (!healed) return { state, updatedAt: row.updatedAt }
    // Marked once the write landed, so a heal that lost a race is retried rather than
    // remembered as done.
    this.healedByRead.add(name)
    return { state, updatedAt: healed.updatedAt ?? row.updatedAt }
  }

  private async loadState(name: string, options: { heal?: boolean, cache?: boolean } = {}): Promise<StoredEponymeState | undefined> {
    return (await this.loadRow(name, options))?.state
  }

  /**
   * Persists the normalized shape of a row, but only if it is still the row that was
   * normalized.
   *
   * Unguarded, this write replaced whatever a concurrent editor had just committed with the
   * normalization of the row it read a moment earlier: a save lost to a background migration,
   * silently, with the timeline showing it as saved. Losing the race is not an error - the
   * row already holds someone's newer content, and the drift is picked up on the next read.
   */
  private async healRow(
    name: string,
    state: StoredEponymeState,
    expectedUpdatedAt: Date | string | undefined,
  ): Promise<{ updatedAt?: Date | string } | undefined> {
    const written = await this.writeState(name, state, expectedUpdatedAt, this.client)
    if (!written) return undefined
    this.rememberHeal(name, expectedUpdatedAt, written.updatedAt)
    await this.invalidate(name)
    return written
  }

  /**
   * Records that a heal replaced one revision with another.
   *
   * A heal rewrites a row with the normalization of what it already held, so it changes
   * nothing any reader ever saw - but it does move `updatedAt`, and without this every editor
   * with the entry open would be told they conflict with a change nobody made. Following the
   * chain lets those saves through; a real write in the middle breaks it and still conflicts.
   *
   * In-process, like `healedByRead`: a heal performed by another instance is unknown here and
   * falls back to reporting the conflict, which is the safe direction to be wrong in.
   */
  private rememberHeal(name: string, from: Date | string | undefined, to: Date | string | undefined): void {
    const before = eponymeRevision(from)
    const after = eponymeRevision(to)
    if (!before || !after || before === after) return
    this.healedRevisions.set(`${name}\n${before}`, after)
  }

  /**
   * Writes a new state only if the row still carries the `updatedAt` we read.
   * Returns undefined when a concurrent editor won the race, so the caller can report a
   * conflict instead of silently discarding their changes.
   *
   * On success it answers with the row's new `updatedAt`: that is the token the editor has to
   * hold from now on, and without it a second save would conflict against its own first one.
   *
   * Dropping the cached row is left to `transaction`, which does it once the write has
   * actually committed rather than while it is still in flight.
   */
  private async writeState(
    name: string,
    next: StoredEponymeState,
    expectedUpdatedAt: Date | string | undefined,
    db: PrismaEponymeDelegates,
  ): Promise<{ updatedAt?: Date | string } | undefined> {
    const data = stateToColumns(next)
    if (!expectedUpdatedAt) {
      const row = await db.eponyme.update({ where: { name }, data })
      return { updatedAt: row.updatedAt }
    }
    const { count } = await db.eponyme.updateMany({ where: { name, updatedAt: expectedUpdatedAt }, data })
    if (!count) return undefined
    const row = await db.eponyme.findUnique({ where: { name } })
    return { updatedAt: row?.updatedAt }
  }

  /**
   * Whether the token a client is writing against still describes the row.
   *
   * An absent token means the caller opted out of the check, which is what a public read or a
   * server-side write does: those never held a revision to begin with.
   *
   * A token only superseded by heals is not stale: those rewrote the row with the shape it
   * already read as, so the client is writing against exactly the content that is stored.
   */
  private isStaleRevision(name: string, expected: string | undefined, updatedAt: Date | string | undefined): boolean {
    if (expected === undefined) return false
    const current = eponymeRevision(updatedAt)
    let revision: string | undefined = expected
    // One heal per entry per process in practice; the cap only keeps a broken chain finite.
    for (let hop = 0; revision !== undefined && revision !== current && hop < 8; hop++)
      revision = this.healedRevisions.get(`${name}\n${revision}`)
    return revision !== current
  }

  /**
   * Every live row of a collection, payload included. The reindex needs both versions of the
   * content, so this is the one read that still selects everything; a listing goes through
   * `collectionRows` with a narrower select.
   */
  private async liveCollectionRows(name: string): Promise<PrismaEponymeRow[]> {
    return await this.client.eponyme.findMany({
      where: { name: { startsWith: `${name}/` }, deletedAt: null },
      orderBy: [
        { updatedAt: 'desc' },
        { name: 'asc' },
      ],
    })
  }

  /**
   * The names a `where` keeps, resolved from the index table before a single row of content
   * is read. This is the point of the index: a filtered listing loads and normalizes the
   * entries it returns, not the whole collection.
   *
   * One query per key, intersected: the values of a key are ORed by the query itself, and
   * the keys are ANDed by narrowing the set. An empty set short-circuits the whole listing.
   */
  private async resolveFilter(
    name: string,
    version: EponymeVersion,
    where: Record<string, EponymeFilterCondition>,
  ): Promise<Set<string>> {
    let matching: Set<string> | undefined
    const excluded = new Set<string>()

    for (const [key, condition] of Object.entries(where)) {
      const { positive, negative } = splitCondition(condition)
      if (positive) {
        const names = await this.indexNames(name, version, key, positive)
        matching = matching === undefined ? names : new Set([...matching].filter(entry => names.has(entry)))
        if (!matching.size) return matching
      }
      // A negation cannot be looked up: the index records what an entry has, never what it
      // lacks, and an entry with no value at all for the key has no row to find. So the
      // values it excludes are resolved positively and then subtracted.
      if (negative) {
        for (const entry of await this.indexNames(name, version, key, negative)) excluded.add(entry)
      }
    }

    // Only negations: there is nothing to narrow, so the collection itself is the starting
    // set. This is the one query the index cannot save, and it reads names rather than
    // content – the payload of every entry still stays out of it.
    const result = matching ?? await this.collectionEntryNames(name)
    for (const entry of excluded) result.delete(entry)
    return result
  }

  private async indexNames(
    name: string,
    version: EponymeVersion,
    key: string,
    value: PrismaStringFilter,
  ): Promise<Set<string>> {
    const rows = await this.client.eponymeEntryIndex.findMany({
      where: { entryName: { startsWith: `${name}/` }, version, key, value },
      select: { entryName: true },
    })
    return new Set(rows.map(row => row.entryName))
  }

  private async collectionEntryNames(name: string): Promise<Set<string>> {
    const rows = await this.client.eponyme.findMany({
      where: { name: { startsWith: `${name}/` }, deletedAt: null },
      orderBy: [{ name: 'asc' }],
      select: { name: true },
    })
    return new Set(rows.flatMap((row) => {
      const slug = row.name.slice(name.length + 1)
      return !slug || slug.includes('/') ? [] : [row.name]
    }))
  }

  /**
   * The rows a filter selected. Never cached: the shared `rows:` key holds the whole
   * collection, and one key per filter combination would evict it for no reuse.
   */
  private async filteredCollectionRows(names: Set<string>): Promise<PrismaEponymeRow[]> {
    return await this.client.eponyme.findMany({
      // The index knows nothing about the trash, so the live filter still has to apply.
      where: { name: { in: [...names] }, deletedAt: null },
      orderBy: [
        { updatedAt: 'desc' },
        { name: 'asc' },
      ],
    })
  }

  async get(name: string, version: EponymeVersionSelector = 'published'): Promise<Record<string, unknown> | undefined> {
    return (await this.getResult(name, version))?.data
  }

  async getResult(name: string, version: EponymeVersionSelector = 'published'): Promise<EponymeResult | undefined> {
    // A numeric selector reads a point in history rather than the entry's current state.
    if (typeof version === 'number') return this.getVersionResult(name, version)
    const cache = version === 'published'
    const row = await this.loadRow(name, { cache })
    if (!row) return undefined
    const { state } = row
    if (version === 'published' && !isEponymeLive(state.__eponyme, new Date())) return undefined
    return {
      data: state.__eponyme[version],
      status: state.__eponyme.status,
      publishedAt: state.__eponyme.publishedAt,
      scheduledPublishAt: state.__eponyme.scheduledPublishAt,
      scheduledUnpublishAt: state.__eponyme.scheduledUnpublishAt,
      // A cached row's `updatedAt` may lag behind the database, and a token that lags turns
      // an honest save into a conflict. Only the uncached draft read hands one out.
      revision: cache ? null : eponymeRevision(row.updatedAt),
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
      scheduledPublishAt: state.__eponyme.scheduledPublishAt,
      scheduledUnpublishAt: state.__eponyme.scheduledUnpublishAt,
      revision: null,
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

    // A filter is resolved from the index first, so what follows only ever touches the rows
    // that already matched rather than the whole collection.
    let names: Set<string> | undefined
    if (query.where && Object.keys(query.where).length) {
      names = await this.resolveFilter(name, version, query.where)
      if (!names.size) return { entries: [], total: 0 }
    }

    const where: PrismaEponymeWhere = {
      name: names ? { in: [...names] } : { startsWith: `${name}/` },
      deletedAt: null,
      ...(version === 'published' ? eponymeLiveWhere(new Date()) : {}),
    }
    // Draft content is never read for a public listing – not filtered out of the response,
    // simply not selected.
    const select: PrismaEponymeSelect = version === 'published'
      ? { name: true, published: true, status: true, publishedAt: true, scheduledPublishAt: true, scheduledUnpublishAt: true, updatedAt: true }
      : { name: true, draft: true, status: true, publishedAt: true, scheduledPublishAt: true, scheduledUnpublishAt: true, updatedAt: true }

    // A search compares titles, which are not a column – so it takes the same path as sorting
    // by one rather than paginating in SQL over rows it cannot judge.
    const search = query.search?.trim().toLocaleLowerCase()
    const pushdown = search ? undefined : pushdownOrderBy(query.orderBy, query.order ?? 'desc')
    if (pushdown) {
      const [rows, total] = await Promise.all([
        this.client.eponyme.findMany({
          where,
          orderBy: pushdown,
          skip: Math.max(0, Math.trunc(query.skip ?? 0) || 0),
          ...(query.take === undefined ? {} : { take: Math.max(0, Math.trunc(query.take) || 0) }),
          select,
        }),
        this.client.eponyme.count({ where }),
      ])
      // `toCollectionEntries` still drops nested names, which `startsWith` cannot exclude.
      // Such a row costs a short page, never a wrong entry.
      return { entries: this.toCollectionEntries(name, definition, version, rows), total }
    }

    // Sorting by `title` or by a content field: those live in the JSON payload, so the whole
    // matching set still has to be read and ordered here.
    const rows = await this.collectionRows(name, version, where, select, names === undefined)
    const all = this.toCollectionEntries(name, definition, version, rows)
    const entries = search
      ? all.filter(entry => `${entry.title} ${entry.slug}`.toLocaleLowerCase().includes(search))
      : all
    const sorted = query.orderBy ? sortCollectionEntries(entries, query.orderBy, query.order ?? 'desc') : entries
    const skip = Math.max(0, Math.trunc(query.skip ?? 0) || 0)
    const take = query.take === undefined ? undefined : Math.max(0, Math.trunc(query.take) || 0)

    return {
      entries: take === undefined ? sorted.slice(skip) : sorted.slice(skip, skip + take),
      total: sorted.length,
    }
  }

  /**
   * The unpaginated read, still cached: an unfiltered listing of one collection is what a
   * page hits repeatedly, and the key carries the version so a draft view cannot answer a
   * public one.
   */
  private async collectionRows(
    name: string,
    version: EponymeVersion,
    where: PrismaEponymeQuery['where'],
    select: PrismaEponymeSelect,
    cache: boolean,
  ): Promise<PrismaEponymeRow[]> {
    const load = () => this.client.eponyme.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      select,
    })
    return cache && version === 'published' ? await this.cached(`rows:${name}:${version}`, load) : await load()
  }

  /**
   * `findMany` already carries every payload, so the state is built here rather than re-read
   * one entry at a time: a listing costs one query, not N+1.
   */
  private toCollectionEntries(
    name: string,
    definition: EponymeCollectionDefinitionBase,
    version: EponymeVersion,
    rows: PrismaEponymeRow[],
  ): EponymeCollectionEntry[] {
    return rows.flatMap((row) => {
      const slug = row.name.slice(name.length + 1)
      if (!slug || slug.includes('/')) return []
      const state = this.rowToState(definition.fields, row)
      return [{
        slug,
        title: String(state.__eponyme[version][definition.titleField] || slug),
        data: state.__eponyme[version],
        status: state.__eponyme.status,
        publishedAt: state.__eponyme.publishedAt,
        scheduledPublishAt: state.__eponyme.scheduledPublishAt,
        scheduledUnpublishAt: state.__eponyme.scheduledUnpublishAt,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      }]
    })
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

      // A sitemap needs a URL and a date, never content. Both are columns now, so this
      // reads neither the draft nor the published payload of a single entry.
      //
      // Its own cache key rather than the listing's: the two select different columns, so
      // they cannot share a result. The `rows:<collection>:` prefix is what a write drops.
      const rows = await this.cached(`rows:${name}:sitemap`, () => this.client.eponyme.findMany({
        where: { name: { startsWith: `${name}/` }, deletedAt: null, ...eponymeLiveWhere(new Date()) },
        orderBy: [{ name: 'asc' }],
        select: { name: true, publishedAt: true, scheduledPublishAt: true, scheduledUnpublishAt: true, status: true },
      }))
      return rows.flatMap((row) => {
        const slug = row.name.slice(name.length + 1)
        if (!slug || slug.includes('/')) return []
        return [withLastmod(applyPreviewSlug(path, slug), toIsoOrNull(row.publishedAt))]
      })
    }))

    const entries = new Map<string, EponymeSitemapEntry>()
    for (const entry of groups.flat())
      entries.set(entry.loc, entry)
    return [...entries.values()]
  }

  /**
   * Every singleton and every live collection entry, as a portable file.
   * Collections are read with one query each rather than one per entry.
   */
  async exportContent(): Promise<EponymeExportFile> {
    const schemas: Record<string, string> = {}
    const entries: EponymeExportEntry[] = []

    for (const [name, schema] of Object.entries(this.schemas)) {
      schemas[name] = schemaFingerprint(schema)
      const row = await this.loadRow(name)
      if (row) entries.push({ name, ...toExportEntry(row.state) })
    }

    for (const [name, definition] of Object.entries(this.collections)) {
      schemas[name] = schemaFingerprint(definition.fields)
      const rows = await this.client.eponyme.findMany({
        where: { name: { startsWith: `${name}/` }, deletedAt: null },
        orderBy: [
          { updatedAt: 'desc' },
          { name: 'asc' },
        ],
      })
      for (const row of rows) {
        const slug = row.name.slice(name.length + 1)
        if (!slug || slug.includes('/')) continue
        entries.push({ name: row.name, collection: name, ...toExportEntry(this.rowToState(definition.fields, row)) })
      }
    }

    return {
      eponyme: { format: 1, exportedAt: new Date().toISOString(), schemas },
      entries,
    }
  }

  /**
   * Applies an export file on top of the current content: every entry it carries is
   * upserted, everything else is left alone. Nothing is ever deleted.
   *
   * The schema check runs first and refuses the whole file, so an import can never
   * land half of its entries into a configuration that no longer matches. The writes then
   * run in one transaction, so a failure partway through leaves nothing behind either –
   * an interrupted import can simply be replayed.
   */
  async importContent(
    file: unknown,
    options: { dryRun?: boolean, actorId?: string, actorUsername?: string } = {},
  ): Promise<EponymeImportOutcome | EponymeImportRejection> {
    const parsed = parseExportFile(file)
    if (!parsed) return { errors: ['This file is not an Eponyme export.'] }

    const declared = parsed.eponyme.schemas
    const mismatch = Object.keys(declared).filter((name) => {
      const local = this.schemas[name] ?? this.collections[name]?.fields
      return !local || schemaFingerprint(local) !== declared[name]
    })
    // An entry whose schema the file never described cannot be checked at all, which
    // is the same risk as a divergent fingerprint.
    for (const entry of parsed.entries) {
      const owner = entry.collection ?? this.getCollectionEntry(entry.name)?.name ?? entry.name
      if (!Object.hasOwn(declared, owner) && !mismatch.includes(owner)) mismatch.push(owner)
    }
    if (mismatch.length) {
      return {
        errors: ['The exported schema does not match this application\'s configuration.'],
        schemaMismatch: mismatch,
      }
    }

    const danglingRelations = await this.importRelationErrors(parsed)
    if (danglingRelations.length) return { errors: danglingRelations }

    // A dry run only reads, so it stays outside a transaction: opening one would hold a
    // connection for the length of the file to protect writes that never happen.
    if (options.dryRun) return await this.applyImport(parsed, options, this.client, () => {})
    return await this.transaction(
      (tx, invalidate) => this.applyImport(parsed, options, tx, invalidate),
      // An import is one unit, so its transaction lasts as long as the file it carries –
      // well past the five seconds Prisma allows by default.
      { maxWait: IMPORT_TRANSACTION_MS, timeout: IMPORT_TRANSACTION_MS },
    )
  }

  /**
   * Relations an export points at that nothing would satisfy. A normal save runs the same
   * check through `relationRejections()`, which an import bypassed: an old or hand-edited
   * file could store a reference to an entry that does not exist.
   *
   * Entries the file itself carries count as present, so a whole-site export stays importable
   * whatever order its entries are in. Runs before any write, like the schema check, so the
   * file is refused as a whole rather than half applied.
   */
  private async importRelationErrors(parsed: EponymeExportFile): Promise<string[]> {
    const references: Array<{ entry: string, entryName: string }> = []
    for (const entry of parsed.entries) {
      const schema = this.schemas[entry.name] ?? this.getCollectionEntry(entry.name)?.definition.fields
      if (!schema) continue
      for (const version of [entry.draft, entry.published]) {
        for (const reference of collectEponymeRelations(schema, normalizeEponymeValues(schema, version)))
          references.push({ entry: entry.name, entryName: reference.entryName })
      }
    }
    if (!references.length) return []

    const carried = new Set(parsed.entries.map(entry => entry.name))
    const names = [...new Set(references.map(reference => reference.entryName))].filter(name => !carried.has(name))
    const rows = names.length
      ? await this.client.eponyme.findMany({
          where: { name: { in: names }, deletedAt: null },
          orderBy: [{ name: 'asc' }],
          select: { name: true },
        })
      : []
    const existing = new Set([...carried, ...rows.map(row => row.name)])

    const errors: string[] = []
    const reported = new Set<string>()
    for (const reference of references) {
      const key = `${reference.entry}:${reference.entryName}`
      if (existing.has(reference.entryName) || reported.has(key)) continue
      reported.add(key)
      errors.push(t('server.importRelationMissing', { name: reference.entry, target: reference.entryName }))
    }
    return errors
  }

  /**
   * The body of an import, over whichever client it was handed: the live one for a dry
   * run, a transaction for the real thing.
   */
  private async applyImport(
    parsed: EponymeExportFile,
    options: { dryRun?: boolean, actorId?: string, actorUsername?: string },
    db: PrismaEponymeDelegates,
    invalidate: (name: string) => void,
  ): Promise<EponymeImportOutcome> {
    const result: EponymeImportOutcome = { dryRun: Boolean(options.dryRun), created: 0, updated: 0, skipped: [], written: [] }
    for (const entry of parsed.entries) {
      const collectionEntry = this.getCollectionEntry(entry.name)
      const schema = this.schemas[entry.name] ?? collectionEntry?.definition.fields
      if (!schema) {
        result.skipped.push({ name: entry.name, reason: t('server.importNoSchema') })
        continue
      }

      const row = await db.eponyme.findUnique({ where: { name: entry.name } })
      if (row?.deletedAt) {
        result.skipped.push({ name: entry.name, reason: t('server.importInTrash') })
        continue
      }

      // Same gate as a read: an unusable value falls back to its default instead of
      // being stored as is.
      const state = this.normalizeState(schema, {
        __eponyme: {
          version: 1,
          draft: entry.draft,
          published: entry.published,
          status: entry.status,
          publishedAt: entry.publishedAt,
          scheduledPublishAt: entry.scheduledPublishAt,
          scheduledUnpublishAt: entry.scheduledUnpublishAt,
        },
      })
      if (collectionEntry) {
        const { slugField } = collectionEntry.definition
        // The name is authoritative: a mismatched slug in the payload would break the
        // immutable-slug invariant every other write relies on.
        if (slugField in state.__eponyme.draft) state.__eponyme.draft[slugField] = collectionEntry.slug
        if (slugField in state.__eponyme.published) state.__eponyme.published[slugField] = collectionEntry.slug
      }

      if (!options.dryRun) {
        const data = state as unknown as Record<string, unknown>
        const columns = stateToColumns(state)
        invalidate(entry.name)
        await db.eponyme.upsert({ where: { name: entry.name }, create: { name: entry.name, ...columns }, update: columns })
        await this.reindexEntry(db, entry.name, state)
        // One version per imported entry, so an import stays reversible from the timeline.
        await db.eponymeVersion.create({
          data: {
            entryName: entry.name,
            data,
            action: 'import',
            status: state.__eponyme.status,
            userId: options.actorId ?? null,
          },
        })
        result.written.push({
          name: entry.name,
          collection: collectionEntry && { name: collectionEntry.name, slug: collectionEntry.slug },
          wasPublished: row?.status === 'published',
          ...toResult(state, state.__eponyme.draft),
        })
      }
      if (row) result.updated++
      else result.created++
    }

    if (!options.dryRun) {
      await this.audit(
        db,
        options.actorId ? { id: options.actorId, username: options.actorUsername ?? '' } : undefined,
        'content.imported',
        'system',
        'content',
        { created: result.created, updated: result.updated, skipped: result.skipped.length },
      )
    }

    return result
  }

  async createCollectionEntry(
    name: string,
    payload: unknown,
    actor?: string | EponymeActor,
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
    const taken = await this.slugTakenError(definition, entryName)
    if (taken) return taken

    const defaults = createDefaultEponymeData(definition.fields) as Record<string, unknown>
    const data = normalizeEponymeValues(definition.fields, { ...defaults, ...input, [definition.slugField]: slug })
    const errors = mergeErrors(
      validateEponymePatch(definition.fields, data, data, 'draft'),
      eponymeRichTextRejections(definition.fields, input),
      await this.relationRejections(definition.fields, data),
    )
    if (Object.keys(errors).length) return { errors }

    const state: StoredEponymeState = {
      __eponyme: {
        version: 1,
        draft: data,
        published: defaults,
        status: 'draft',
        publishedAt: null,
        scheduledPublishAt: null,
        scheduledUnpublishAt: null,
      },
    }
    const stored = state as unknown as Record<string, unknown>
    const columns = stateToColumns(state)
    try {
      // The entry and its first version are created together: an entry that exists with an
      // empty timeline reads as if it had never been edited, which nothing can repair later.
      await this.transaction(async (tx, invalidate) => {
        invalidate(entryName)
        await tx.eponyme.create({ data: { name: entryName, ...columns } })
        await this.reindexEntry(tx, entryName, state)
        await tx.eponymeVersion.create({ data: { entryName, data: stored, action: 'draft', status: 'draft', userId: actorId(actor) } })
        await this.audit(tx, actor, 'content.created', 'collection', entryName)
      })
    }
    catch (error) {
      // Another request created the same slug between our check and this insert.
      if (isPrismaError(error, 'P2002')) return await this.slugTakenError(definition, entryName) ?? { errors: { [definition.slugField]: [t('server.slugTaken')] } }
      throw error
    }
    // No revision: the dashboard navigates to the new entry, which reads its own token.
    return { slug, data, status: 'draft', publishedAt: null, scheduledPublishAt: null, scheduledUnpublishAt: null, revision: null }
  }

  /**
   * A trashed entry keeps its row, so it keeps its slug: reusing one has to be
   * refused with an error the editor can act on rather than the generic message.
   */
  private async slugTakenError(
    definition: EponymeCollectionDefinitionBase,
    entryName: string,
  ): Promise<{ errors: ValidationErrors } | undefined> {
    const row = await this.client.eponyme.findUnique({ where: { name: entryName } })
    if (!row) return undefined
    return {
      errors: {
        [definition.slugField]: [row.deletedAt
          ? t('server.slugInTrash')
          : t('server.slugTaken')],
      },
    }
  }

  /**
   * Live entries still pointing at this one, draft or published.
   *
   * Read from the index rather than from the payloads: a relation is recorded there at every
   * depth, so a reference buried in an array of items is found by the same lookup as one at
   * the root. A trashed referrer is left out – it is visible nowhere, so it holds nothing back.
   */
  async findEponymeReferrers(entryName: string): Promise<string[]> {
    const rows = await this.client.eponymeEntryIndex.findMany({
      where: { key: EPONYME_RELATION_INDEX_KEY, value: foldEponymeIndexValue(entryName) },
      select: { entryName: true },
    })
    const names = [...new Set(rows.map(row => row.entryName))].filter(referrer => referrer !== entryName)
    if (!names.length) return []
    const live = await this.client.eponyme.findMany({
      where: { name: { in: names }, deletedAt: null },
      orderBy: [{ name: 'asc' }],
      select: { name: true },
    })
    return live.map(row => row.name)
  }

  /**
   * Moves an entry to the trash. Its history is kept, so it stays restorable.
   *
   * Refused while another entry points at it: a reference is only worth having if it cannot
   * quietly stop resolving, and the editor is told which entries to detach first.
   */
  async deleteCollectionEntry(
    name: string,
    actor?: string | EponymeActor,
    expectedRevision?: string,
  ): Promise<{ deleted: true } | { referencedBy: string[] } | EponymeConflict | undefined> {
    if (!this.getCollectionEntry(name)) return undefined
    // Read straight from the row rather than through `loadRow`: this is the same token the
    // listing handed out, and healing here would move it under the caller's feet.
    const row = await this.client.eponyme.findUnique({ where: { name } })
    if (this.isStaleRevision(name, expectedRevision, row?.updatedAt)) return { conflict: true }
    const referencedBy = await this.findEponymeReferrers(name)
    if (referencedBy.length) return { referencedBy }
    // Guarding on `deletedAt: null` makes a second delete a no-op rather than
    // moving the deletion date forward.
    const count = await this.transaction(async (tx, invalidate) => {
      invalidate(name)
      const updated = await tx.eponyme.updateMany({
        where: { name, deletedAt: null, ...(expectedRevision ? { updatedAt: row!.updatedAt } : {}) },
        data: { deletedAt: new Date() },
      })
      if (updated.count) await this.audit(tx, actor, 'content.trashed', 'collection', name)
      return updated.count
    })
    return count > 0 ? { deleted: true } : undefined
  }

  /**
   * Names every relation of a payload whose target is missing, so a reference can never be
   * stored pointing at nothing. Asked of the database, which is why it cannot live in
   * `validateEponymeData` beside the rules that are pure.
   */
  private async relationRejections(schema: EponymeSchema, data: Record<string, unknown>): Promise<ValidationErrors> {
    const references = collectEponymeRelations(schema, data)
    if (!references.length) return {}

    const errors: ValidationErrors = {}
    const missing = new Map<string, string[]>()
    // A relation to a collection that is not declared is a configuration mistake rather than
    // a content one, and reads as such.
    for (const reference of references) {
      if (this.collections[reference.collection]) continue
      errors[reference.path] = [t('server.relationUnknownCollection', { collection: reference.collection })]
    }

    const names = [...new Set(references.filter(reference => this.collections[reference.collection]).map(reference => reference.entryName))]
    if (!names.length) return errors
    const rows = await this.client.eponyme.findMany({
      where: { name: { in: names }, deletedAt: null },
      orderBy: [{ name: 'asc' }],
      select: { name: true },
    })
    const existing = new Set(rows.map(row => row.name))

    for (const reference of references) {
      if (!this.collections[reference.collection] || existing.has(reference.entryName)) continue
      missing.set(reference.path, [...(missing.get(reference.path) ?? []), reference.slug])
    }
    for (const [path, slugs] of missing)
      errors[path] = [t('server.relationMissing', { slugs: slugs.join(', ') })]
    return errors
  }

  async restoreCollectionEntry(
    name: string,
    actor?: string | EponymeActor,
    expectedRevision?: string,
  ): Promise<boolean | EponymeConflict> {
    if (!this.getCollectionEntry(name)) return false
    // `loadRow` reads a trashed entry as missing, so the token comes from the row itself.
    const row = await this.client.eponyme.findUnique({ where: { name } })
    if (this.isStaleRevision(name, expectedRevision, row?.updatedAt)) return { conflict: true }
    const count = await this.transaction(async (tx, invalidate) => {
      invalidate(name)
      const updated = await tx.eponyme.updateMany({
        where: { name, deletedAt: { not: null }, ...(expectedRevision ? { updatedAt: row!.updatedAt } : {}) },
        data: { deletedAt: null },
      })
      if (updated.count) await this.audit(tx, actor, 'content.restored_from_trash', 'collection', name)
      return updated.count
    })
    return count > 0
  }

  /** Definitive: `onDelete: Cascade` takes the entry's whole history with it. */
  async purgeCollectionEntry(name: string, actor?: string | EponymeActor): Promise<boolean> {
    if (!this.getCollectionEntry(name)) return false
    const row = await this.client.eponyme.findUnique({ where: { name } })
    if (!row?.deletedAt) return false
    try {
      await this.transaction(async (tx, invalidate) => {
        invalidate(name)
        await tx.eponyme.delete({ where: { name } })
        await this.audit(tx, actor, 'content.purged', 'collection', name)
      })
    }
    catch (error) {
      // Already gone, or purged by a concurrent request.
      if (isPrismaError(error, 'P2025')) return false
      throw error
    }
    return true
  }

  /** Trashed entries of a collection, most recently updated first. */
  async listCollectionTrash(name: string): Promise<EponymeCollectionPage | undefined> {
    const definition = this.collections[name]
    if (!definition) return undefined
    const rows = await this.client.eponyme.findMany({
      where: { name: { startsWith: `${name}/` }, deletedAt: { not: null } },
      orderBy: [
        { updatedAt: 'desc' },
        { name: 'asc' },
      ],
    })
    const entries = rows.flatMap((row) => {
      const slug = row.name.slice(name.length + 1)
      if (!slug || slug.includes('/')) return []
      // `getResult` reads a trashed entry as missing, so the state is read here directly.
      const state = this.rowToState(definition.fields, row)
      return [{
        slug,
        title: String(state.__eponyme.draft[definition.titleField] || slug),
        data: state.__eponyme.draft,
        status: state.__eponyme.status,
        publishedAt: state.__eponyme.publishedAt,
        scheduledPublishAt: state.__eponyme.scheduledPublishAt,
        scheduledUnpublishAt: state.__eponyme.scheduledUnpublishAt,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      }]
    })
    return { entries, total: entries.length }
  }

  async patch(
    name: string,
    payload: unknown,
    action: EponymeAction = 'publish',
    actor?: string | EponymeActor,
    schedule: EponymeSchedule = {},
    expectedRevision?: string,
  ): Promise<(EponymeResult & { errors?: never, conflict?: never }) | { errors: ValidationErrors, conflict?: never } | EponymeConflict | undefined> {
    const schema = this.getSchema(name)
    if (!schema) return undefined
    const row = await this.loadRow(name, { heal: true })
    if (!row) return undefined
    const { state, updatedAt } = row
    // Checked before validating: an editor writing against a version that no longer exists
    // should be told so, not handed errors computed against content they never saw.
    if (this.isStaleRevision(name, expectedRevision, updatedAt)) return { conflict: true }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { errors: { _form: ['Body must be an object.'] } }

    const collectionEntry = this.getCollectionEntry(name)
    if (collectionEntry && collectionEntry.definition.slugField in payload) {
      const submittedSlug = (payload as Record<string, unknown>)[collectionEntry.definition.slugField]
      if (submittedSlug !== collectionEntry.slug)
        return { errors: { [collectionEntry.definition.slugField]: ['The slug cannot be changed after creation.'] } }
    }

    // Normalised before validation, so both the errors and the stored value are computed on
    // the canonical form rather than on whatever the client happened to send.
    const data = normalizeEponymeValues(schema, { ...state.__eponyme.draft, ...(payload as Record<string, unknown>) })
    const validationMode: ValidationMode = action === 'publish' || action === 'schedule' ? 'publish' : 'draft'
    const patchErrors = validateEponymePatch(schema, normalizeEponymeValues(schema, payload as Record<string, unknown>), data, validationMode)
    // Read from the payload, not from `data`: the normalisation above has already removed
    // whatever there was to complain about.
    const stripped = eponymeRichTextRejections(schema, payload as Record<string, unknown>)
    // Checked against what is being written rather than against the whole entry: a reference
    // stored before its target was trashed is not this save's fault to answer for.
    const danglingRelations = await this.relationRejections(schema, normalizeEponymeValues(schema, payload as Record<string, unknown>))
    const errors = validationMode === 'publish'
      ? mergeErrors(patchErrors, stripped, danglingRelations, validateEponymeData(schema, data, 'publish'))
      : mergeErrors(patchErrors, stripped, danglingRelations)
    const parsedSchedule = action === 'schedule' ? normalizeSchedule(schedule) : schedule
    if (action === 'schedule' && !parsedSchedule)
      errors._form = [t('server.invalidSchedule')]
    if (Object.keys(errors).length) return { errors }

    const next = applyEponymeAction(state, data, action, parsedSchedule ?? {}, new Date())
    // The entry and the version it produces land as a unit, so the timeline can never
    // gain an entry the content never took, nor miss one it did.
    const written = await this.transaction(async (tx, invalidate) => {
      invalidate(name)
      const write = await this.writeState(name, next, updatedAt, tx)
      if (!write) return undefined
      await this.reindexEntry(tx, name, next)
      await tx.eponymeVersion.create({
        data: {
          entryName: name,
          data: next as unknown as Record<string, unknown>,
          action,
          status: next.__eponyme.status,
          userId: actorId(actor),
        },
      })
      await this.audit(
        tx,
        actor,
        auditAction(action),
        collectionEntry ? 'collection' : 'singleton',
        name,
        { status: next.__eponyme.status },
      )
      return write
    })
    if (!written) return { conflict: true }
    return toResult(next, next.__eponyme.draft, eponymeRevision(written.updatedAt))
  }

  /**
   * Materializes due dates for history, hooks and cache/CDN invalidation. Public reads do not
   * depend on this method: `isEponymeLive` and `eponymeLiveWhere` remain authoritative.
   */
  async runSchedule(now = new Date()): Promise<EponymeScheduleTransition[]> {
    const dueRows = await this.client.eponyme.findMany({
      where: {
        deletedAt: null,
        OR: [
          { scheduledPublishAt: { lte: now } },
          { scheduledUnpublishAt: { lte: now } },
        ],
      },
      orderBy: [{ name: 'asc' }],
    })
    const transitions: EponymeScheduleTransition[] = []

    for (const dueRow of dueRows) {
      const schema = this.getSchema(dueRow.name)
      if (!schema) continue
      const row = await this.loadRow(dueRow.name, { heal: true })
      if (!row) continue
      const current = row.state.__eponyme
      const publishDue = Boolean(current.scheduledPublishAt && new Date(current.scheduledPublishAt) <= now)
      const unpublishDue = Boolean(current.scheduledUnpublishAt && new Date(current.scheduledUnpublishAt) <= now)
      if (!publishDue && !unpublishDue) continue

      const states: Array<{ action: 'publish' | 'unpublish', state: StoredEponymeState }> = []
      let next = row.state
      if (publishDue) {
        next = wrapState(
          current.draft,
          current.published,
          'published',
          current.publishedAt,
          null,
          current.scheduledUnpublishAt,
        )
        states.push({ action: 'publish', state: next })
      }
      if (unpublishDue) {
        const before = next.__eponyme
        next = wrapState(before.draft, before.published, 'unpublished', before.publishedAt, before.scheduledPublishAt, null)
        states.push({ action: 'unpublish', state: next })
      }

      const written = await this.transaction(async (tx, invalidate) => {
        invalidate(dueRow.name)
        if (!await this.writeState(dueRow.name, next, row.updatedAt, tx)) return false
        await this.reindexEntry(tx, dueRow.name, next)
        for (const transition of states) {
          await tx.eponymeVersion.create({
            data: {
              entryName: dueRow.name,
              data: transition.state as unknown as Record<string, unknown>,
              action: transition.action,
              status: transition.state.__eponyme.status,
            },
          })
          await this.audit(
            tx,
            undefined,
            transition.action === 'publish' ? 'content.published' : 'content.unpublished',
            this.getCollectionEntry(dueRow.name) ? 'collection' : 'singleton',
            dueRow.name,
            { scheduled: true, status: transition.state.__eponyme.status },
          )
        }
        return true
      })
      if (!written) continue
      for (const transition of states) {
        transitions.push({ name: dueRow.name, action: transition.action, ...toResult(transition.state, transition.state.__eponyme.published) })
      }
    }

    return transitions
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
      action: isHistoryAction(version.action) ? version.action : 'restore',
      status: toEponymeStatus(version.status),
      createdAt: new Date(version.createdAt).toISOString(),
      user: version.user ? { id: version.user.id, username: version.user.username } : null,
    }))
  }

  async restore(
    name: string,
    versionId: number,
    actor?: string | EponymeActor,
    expectedRevision?: string,
  ): Promise<EponymeResult | EponymeConflict | undefined> {
    const schema = this.getSchema(name)
    if (!schema) return undefined
    const version = await this.client.eponymeVersion.findUnique({ where: { id: versionId } })
    if (!version || version.entryName !== name) return undefined
    const current = await this.loadRow(name, { heal: true })
    if (!current) return undefined
    if (this.isStaleRevision(name, expectedRevision, current.updatedAt)) return { conflict: true }
    const state = this.normalizeState(schema, version.data)
    const written = await this.transaction(async (tx, invalidate) => {
      invalidate(name)
      const write = await this.writeState(name, state, current.updatedAt, tx)
      if (!write) return undefined
      await this.reindexEntry(tx, name, state)
      await tx.eponymeVersion.create({
        data: {
          entryName: name,
          data: state as unknown as Record<string, unknown>,
          action: 'restore',
          status: state.__eponyme.status,
          userId: actorId(actor),
        },
      })
      await this.audit(
        tx,
        actor,
        'content.version_restored',
        this.getCollectionEntry(name) ? 'collection' : 'singleton',
        name,
        { versionId },
      )
      return write
    })
    if (!written) return { conflict: true }
    return toResult(state, state.__eponyme.draft, eponymeRevision(written.updatedAt))
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
    && isEponymeStatus(state.status)
    && (state.publishedAt === null || typeof state.publishedAt === 'string')
    && (state.scheduledPublishAt == null || typeof state.scheduledPublishAt === 'string')
    && (state.scheduledUnpublishAt == null || typeof state.scheduledUnpublishAt === 'string'),
  )
  if (!valid) return undefined
  const stored = state as StoredEponymeState['__eponyme']
  return {
    ...stored,
    scheduledPublishAt: toIsoOrNull(stored.scheduledPublishAt),
    scheduledUnpublishAt: toIsoOrNull(stored.scheduledUnpublishAt),
  }
}

function isHistoryAction(action: string): action is EponymeHistoryEntry['action'] {
  return action === 'draft' || action === 'publish' || action === 'unpublish'
    || action === 'revertToDraft' || action === 'schedule' || action === 'unschedule'
    || action === 'restore' || action === 'import'
}

function toExportEntry(state: StoredEponymeState): Omit<EponymeExportEntry, 'name' | 'collection'> {
  return {
    draft: state.__eponyme.draft,
    published: state.__eponyme.published,
    status: state.__eponyme.status,
    publishedAt: state.__eponyme.publishedAt,
    scheduledPublishAt: state.__eponyme.scheduledPublishAt,
    scheduledUnpublishAt: state.__eponyme.scheduledUnpublishAt,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isEmptyPlainObject(value: unknown): value is Record<string, never> {
  return isPlainObject(value) && Object.keys(value).length === 0
}

/**
 * An entry that has never been published keeps an empty public version rather than a copy of
 * its draft, so `revertToDraft` stays distinguishable from "published, then emptied".
 */
function shouldKeepEmptyPublished(state: StoredEponymeState['__eponyme']): boolean {
  return state.status === 'draft' && state.publishedAt === null && isEmptyPlainObject(state.published)
}

/**
 * Describes the shape of a schema – field names and types, nested containers included –
 * while ignoring labels, placeholders and validators. Renaming a label must not block
 * an import; adding or retyping a field must.
 */
function describeSchema(schema: object): string {
  const fields = schema as Record<string, unknown>
  return Object.keys(fields).sort().map(key => `${key}:${describeField(fields[key])}`).join(',')
}

function describeField(field: unknown): string {
  if (!isPlainObject(field) || typeof field.type !== 'string') return 'unknown'
  const options = isPlainObject(field.options) ? field.options : {}
  if (field.type === 'array') {
    // `of` is either a single field definition or a record of them.
    const item = isPlainObject(options.of) ? options.of : {}
    return `array(${typeof item.type === 'string' ? describeField(item) : describeSchema(item)})`
  }
  if (field.type === 'section')
    return `section(${describeSchema(isPlainObject(options.fields) ? options.fields : {})})`
  if (field.type === 'tabs') {
    const tabs = isPlainObject(options.tabs) ? options.tabs : {}
    return `tabs(${Object.keys(tabs).sort().map((key) => {
      const tab = tabs[key]
      return `${key}:${describeSchema(isPlainObject(tab) && isPlainObject(tab.fields) ? tab.fields : {})}`
    }).join(',')})`
  }
  if (field.type === 'custom')
    return `custom(${typeof field.name === 'string' ? field.name : 'unknown'})`
  return field.type
}

/** Stable hash of a schema's shape, embedded in an export and checked on import. */
export function schemaFingerprint(schema: EponymeSchema): string {
  return createHash('sha256').update(describeSchema(schema)).digest('hex').slice(0, 32)
}

/** Accepts a parsed export file, rejecting anything whose envelope or entries are unusable. */
function parseExportFile(value: unknown): EponymeExportFile | undefined {
  if (!isPlainObject(value)) return undefined
  const envelope = value.eponyme
  if (!isPlainObject(envelope) || envelope.format !== 1 || !isPlainObject(envelope.schemas)) return undefined
  if (!Object.values(envelope.schemas).every(fingerprint => typeof fingerprint === 'string')) return undefined
  if (!Array.isArray(value.entries)) return undefined

  const entries: EponymeExportEntry[] = []
  for (const entry of value.entries) {
    if (!isPlainObject(entry)) return undefined
    const { name, collection, draft, published, status, publishedAt, scheduledPublishAt, scheduledUnpublishAt } = entry
    const valid = typeof name === 'string' && name.length > 0
      && isPlainObject(draft) && isPlainObject(published)
      && isEponymeStatus(status)
      && (publishedAt === null || typeof publishedAt === 'string')
      && (scheduledPublishAt == null || typeof scheduledPublishAt === 'string')
      && (scheduledUnpublishAt == null || typeof scheduledUnpublishAt === 'string')
      && (collection === undefined || typeof collection === 'string')
    if (!valid) return undefined
    entries.push({
      name,
      collection,
      draft,
      published,
      status,
      publishedAt,
      scheduledPublishAt: toIsoOrNull(scheduledPublishAt as string | null | undefined),
      scheduledUnpublishAt: toIsoOrNull(scheduledUnpublishAt as string | null | undefined),
    } as EponymeExportEntry)
  }

  return {
    eponyme: {
      format: 1,
      exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : new Date().toISOString(),
      schemas: envelope.schemas as Record<string, string>,
    },
    entries,
  }
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

function actorId(actor: string | EponymeActor | undefined): string | null {
  return typeof actor === 'string' ? actor : actor?.id ?? null
}

function auditAction(action: EponymeAction): string {
  if (action === 'draft') return 'content.draft_saved'
  if (action === 'publish') return 'content.published'
  if (action === 'unpublish') return 'content.unpublished'
  if (action === 'revertToDraft') return 'content.reverted_to_draft'
  if (action === 'schedule') return 'content.scheduled'
  return 'content.unscheduled'
}

function isEponymeStatus(value: unknown): value is EponymeStatus {
  return value === 'draft' || value === 'published' || value === 'unpublished'
}

function toEponymeStatus(value: unknown): EponymeStatus {
  return isEponymeStatus(value) ? value : 'published'
}

/** The only in-memory definition of public visibility. */
export function isEponymeLive(
  state: Pick<StoredEponymeState['__eponyme'], 'status' | 'scheduledPublishAt' | 'scheduledUnpublishAt'>,
  now: Date,
): boolean {
  const time = now.getTime()
  const publishAt = state.scheduledPublishAt ? new Date(state.scheduledPublishAt).getTime() : null
  const unpublishAt = state.scheduledUnpublishAt ? new Date(state.scheduledUnpublishAt).getTime() : null
  return state.status === 'published'
    && (publishAt === null || publishAt <= time)
    && (unpublishAt === null || unpublishAt > time)
}

/** SQL translation of `isEponymeLive`; keep both changes together. */
export function eponymeLiveWhere(now: Date): PrismaEponymeWhere {
  return {
    status: 'published',
    AND: [
      { OR: [{ scheduledPublishAt: null }, { scheduledPublishAt: { lte: now } }] },
      { OR: [{ scheduledUnpublishAt: null }, { scheduledUnpublishAt: { gt: now } }] },
    ],
  }
}

function normalizeSchedule(schedule: EponymeSchedule): Required<EponymeSchedule> | undefined {
  const scheduledPublishAt = schedule.scheduledPublishAt ? toIsoOrNull(schedule.scheduledPublishAt) : null
  const scheduledUnpublishAt = schedule.scheduledUnpublishAt ? toIsoOrNull(schedule.scheduledUnpublishAt) : null
  if ((schedule.scheduledPublishAt && !scheduledPublishAt) || (schedule.scheduledUnpublishAt && !scheduledUnpublishAt)) return undefined
  if (!scheduledPublishAt && !scheduledUnpublishAt) return undefined
  return { scheduledPublishAt, scheduledUnpublishAt }
}

function applyEponymeAction(
  current: StoredEponymeState,
  draft: Record<string, unknown>,
  action: EponymeAction,
  schedule: EponymeSchedule,
  now: Date,
): StoredEponymeState {
  const previous = current.__eponyme
  const scheduledPublishAt = schedule.scheduledPublishAt ?? null
  const scheduledUnpublishAt = schedule.scheduledUnpublishAt ?? null
  const schedulesPublication = action === 'schedule' && Boolean(scheduledPublishAt)
  const updatesPublishedContent = schedulesPublication || (action === 'schedule' && previous.status === 'published')

  if (action === 'publish') {
    return wrapState(draft, draft, 'published', now.toISOString(), null, null)
  }
  if (action === 'unpublish') {
    return wrapState(draft, previous.published, 'unpublished', previous.publishedAt, null, null)
  }
  if (action === 'revertToDraft') {
    return wrapState(draft, {}, 'draft', null, null, null)
  }
  if (action === 'schedule') {
    return wrapState(
      draft,
      updatesPublishedContent ? draft : previous.published,
      schedulesPublication ? 'published' : previous.status,
      schedulesPublication ? now.toISOString() : previous.publishedAt,
      scheduledPublishAt,
      scheduledUnpublishAt,
    )
  }
  if (action === 'unschedule') {
    return wrapState(draft, previous.published, previous.status, previous.publishedAt, null, null)
  }
  // A draft-only save must not make the currently published version disappear.
  return wrapState(draft, previous.published, previous.status, previous.publishedAt, previous.scheduledPublishAt, previous.scheduledUnpublishAt)
}

function wrapState(
  draft: Record<string, unknown>,
  published: Record<string, unknown>,
  status: EponymeStatus,
  publishedAt: string | null,
  scheduledPublishAt: string | null,
  scheduledUnpublishAt: string | null,
): StoredEponymeState {
  return { __eponyme: { version: 1, draft, published, status, publishedAt, scheduledPublishAt, scheduledUnpublishAt } }
}

function toResult(state: StoredEponymeState, data: Record<string, unknown>, revision: string | null = null): EponymeResult {
  return {
    data,
    status: state.__eponyme.status,
    publishedAt: state.__eponyme.publishedAt,
    scheduledPublishAt: state.__eponyme.scheduledPublishAt,
    scheduledUnpublishAt: state.__eponyme.scheduledUnpublishAt,
    revision,
  }
}

/**
 * The lock token an entry is read at: its `updatedAt`, as an ISO string.
 *
 * A string rather than the raw column, because it travels to the browser and back. It is only
 * ever compared to another token here, never turned back into a date to query on: the write
 * still locks on the value it read from the row, so a store whose `updatedAt` is not a `Date`
 * compares the same way the database does.
 */
export function eponymeRevision(updatedAt: Date | string | undefined): string | null {
  if (!updatedAt) return null
  const date = new Date(updatedAt)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function stateToColumns(state: StoredEponymeState): EponymeRowWrite {
  const { draft, published, status, publishedAt, scheduledPublishAt, scheduledUnpublishAt } = state.__eponyme
  return {
    draft,
    published,
    status,
    publishedAt: publishedAt ? new Date(publishedAt) : null,
    scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt) : null,
    scheduledUnpublishAt: scheduledUnpublishAt ? new Date(scheduledUnpublishAt) : null,
  }
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Whether a reconciled state already matches what the row holds – the test that decides
 * whether a read has to heal.
 *
 * `publishedAt` is reduced to an ISO string on both sides on purpose. The column comes back
 * as a `Date` and the state carries a string; comparing them directly would never match, and
 * every public read would turn into a write.
 */
function sameRow(state: StoredEponymeState, row: PrismaEponymeRow): boolean {
  const stored = state.__eponyme
  return isDeepStrictEqual(stored.draft, row.draft)
    && isDeepStrictEqual(stored.published, row.published)
    && stored.status === row.status
    && stored.publishedAt === toIsoOrNull(row.publishedAt)
    && stored.scheduledPublishAt === toIsoOrNull(row.scheduledPublishAt)
    && stored.scheduledUnpublishAt === toIsoOrNull(row.scheduledUnpublishAt)
}

/**
 * Turns one condition into what the index table can answer: the part that selects rows, and
 * the part the caller has to subtract.
 *
 * Every value goes through the same folding as the write path, so a filter never has to know
 * which spelling of a tag happened to be stored first.
 */
function splitCondition(condition: EponymeFilterCondition): { positive?: PrismaStringFilter, negative?: PrismaStringFilter } {
  if (typeof condition === 'string') return { positive: foldEponymeIndexValue(condition) }
  if (Array.isArray(condition)) return { positive: { in: condition.map(foldEponymeIndexValue) } }

  const positive: Exclude<PrismaStringFilter, string> = {}
  if (condition.in?.length) positive.in = condition.in.map(foldEponymeIndexValue)
  if (condition.contains) positive.contains = foldEponymeIndexValue(condition.contains)
  for (const bound of ['gte', 'lte', 'gt', 'lt'] as const) {
    const value = condition[bound]
    if (value !== undefined) positive[bound] = foldEponymeIndexValue(value)
  }
  return {
    // An operator object carrying only `not` has no positive part, and an empty one filters
    // nothing at all rather than matching nothing.
    positive: Object.keys(positive).length ? positive : undefined,
    negative: condition.not?.length ? { in: condition.not.map(foldEponymeIndexValue) } : undefined,
  }
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

/**
 * The SQL ordering for a sort key, or `undefined` when the key can only be compared in
 * memory.
 *
 * Only real columns qualify. `title` and every content field live inside the JSON payload,
 * and `slug` is left out deliberately even though it is derivable from `name`: Postgres
 * collation does not reproduce `localeCompare(..., { numeric: true })`, so pushing it down
 * would quietly change an order that already ships.
 *
 * `nulls: 'last'` is not decoration. Postgres puts NULLs first in `DESC`, while
 * `sortCollectionEntries` sinks empty values to the bottom in both directions – without it,
 * the two modes would disagree on where an unpublished entry belongs.
 */
function pushdownOrderBy(orderBy: string | undefined, order: EponymeSortDirection): PrismaEponymeOrderBy[] | undefined {
  if (orderBy === undefined) return [{ updatedAt: 'desc' }, { name: 'asc' }]
  if (orderBy === 'updatedAt') return [{ updatedAt: order }, { name: 'asc' }]
  if (orderBy === 'publishedAt') return [{ publishedAt: { sort: order, nulls: 'last' } }, { name: 'asc' }]
  return undefined
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
