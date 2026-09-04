/**
 * Version of the persistence contract Eponyme expects, kept apart from the npm version: a release that
 * changes no table must not force anyone to migrate.
 */
export const EPONYME_SCHEMA_VERSION = 3

interface PrismaEponymeSchemaRow {
  version: number
}

export interface PrismaEponymeSchemaClient {
  eponymeSchema: {
    findUnique(args: { where: { key: string } }): Promise<PrismaEponymeSchemaRow | null>
  }
}

export type EponymeSchemaVerification
  = | { ok: true, version: number }
    /** The table or its Prisma delegate is absent: the migration has never been applied. */
    | { ok: false, reason: 'absent', version?: never }
    /** Recorded below what this build expects: migrations are pending. */
    | { ok: false, reason: 'behind', version: number }
    /** Recorded above what this build expects: the database was migrated by a newer Eponyme. */
    | { ok: false, reason: 'ahead', version: number }
    /** The read itself failed. Nothing is known about the schema, and `cause` says why. */
    | { ok: false, reason: 'unknown', version?: never, cause: unknown }

/** Prisma's code for a table that does not exist, and the Postgres code underneath it. */
const MISSING_RELATION_CODES = new Set(['P2021', '42P01'])

/** A missing table, as opposed to a database that could not be reached at all. */
function isMissingRelation(error: unknown): boolean {
  // A Prisma client generated before the model existed: the delegate itself is missing.
  if (error instanceof TypeError) return true
  if (!error || typeof error !== 'object') return false
  const { code, meta, message } = error as { code?: unknown, meta?: { code?: unknown }, message?: unknown }
  if (typeof code === 'string' && MISSING_RELATION_CODES.has(code)) return true
  if (typeof meta?.code === 'string' && MISSING_RELATION_CODES.has(meta.code)) return true
  return typeof message === 'string' && /does not exist|42P01/i.test(message)
}

/** Reads the version recorded in `_eponyme_schema` and compares it to this build's. */
export class EponymeSchemaService {
  constructor(private readonly client: PrismaEponymeSchemaClient) {}

  async verify(): Promise<EponymeSchemaVerification> {
    let row: PrismaEponymeSchemaRow | null
    try {
      row = await this.client.eponymeSchema.findUnique({ where: { key: 'eponyme' } })
    }
    catch (error) {
      // A missing table and a missing delegate both mean the migration has not run.
      if (!isMissingRelation(error)) return { ok: false, reason: 'unknown', cause: error }
      return { ok: false, reason: 'absent' }
    }

    if (!row) return { ok: false, reason: 'absent' }
    if (row.version < EPONYME_SCHEMA_VERSION) return { ok: false, reason: 'behind', version: row.version }
    if (row.version > EPONYME_SCHEMA_VERSION) return { ok: false, reason: 'ahead', version: row.version }
    return { ok: true, version: row.version }
  }
}
