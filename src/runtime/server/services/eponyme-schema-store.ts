/**
 * Version of the persistence contract Eponyme expects, kept apart from the npm version: a
 * release that changes no table must not force anyone to migrate.
 *
 * Raise it in the same commit as the migration that changes the stored shape, and raise
 * `EPONYME_SCHEMA_VERSION` in `@eponyme/cli` to match, since that package ships the migration
 * that writes the number this one reads. The two are a contract with the same value written
 * twice, and a mismatch is what this check exists to surface.
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

/**
 * Reads the version recorded in `_eponyme_schema` and compares it to this build's.
 *
 * Reports rather than throws, because the three failures do not deserve the same answer: a
 * database left behind cannot serve this code and has to stop the boot, while one already
 * ahead usually still works and only deserves a warning.
 */
export class EponymeSchemaService {
  constructor(private readonly client: PrismaEponymeSchemaClient) {}

  async verify(): Promise<EponymeSchemaVerification> {
    let row: PrismaEponymeSchemaRow | null
    try {
      row = await this.client.eponymeSchema.findUnique({ where: { key: 'eponyme' } })
    }
    catch {
      // A missing table and a missing delegate both land here, and both mean the same thing
      // to an operator: the migration that introduced them has not run.
      return { ok: false, reason: 'absent' }
    }

    if (!row) return { ok: false, reason: 'absent' }
    if (row.version < EPONYME_SCHEMA_VERSION) return { ok: false, reason: 'behind', version: row.version }
    if (row.version > EPONYME_SCHEMA_VERSION) return { ok: false, reason: 'ahead', version: row.version }
    return { ok: true, version: row.version }
  }
}
