import { describe, expect, it } from 'vitest'
import {
  EPONYME_SCHEMA_VERSION,
  EponymeSchemaService,
  type PrismaEponymeSchemaClient,
} from '../src/runtime/server/services/eponyme-schema-store'

function createClient(row: { version: number } | null | Error): PrismaEponymeSchemaClient {
  return {
    eponymeSchema: {
      async findUnique() {
        if (row instanceof Error) throw row
        return row
      },
    },
  }
}

describe('EponymeSchemaService', () => {
  it('accepts a database recorded at the expected version', async () => {
    const result = await new EponymeSchemaService(createClient({ version: EPONYME_SCHEMA_VERSION })).verify()
    expect(result).toEqual({ ok: true, version: EPONYME_SCHEMA_VERSION })
  })

  it('reports a database left behind, with the version it is actually at', async () => {
    const result = await new EponymeSchemaService(createClient({ version: EPONYME_SCHEMA_VERSION - 1 })).verify()
    expect(result).toEqual({ ok: false, reason: 'behind', version: EPONYME_SCHEMA_VERSION - 1 })
  })

  it('reports a database ahead separately, since it usually still works', async () => {
    const result = await new EponymeSchemaService(createClient({ version: EPONYME_SCHEMA_VERSION + 1 })).verify()
    expect(result).toEqual({ ok: false, reason: 'ahead', version: EPONYME_SCHEMA_VERSION + 1 })
  })

  it('treats a missing row and a missing table as the same absence', async () => {
    await expect(new EponymeSchemaService(createClient(null)).verify())
      .resolves.toEqual({ ok: false, reason: 'absent' })
    // A table that does not exist, and a Prisma client generated before the model did, both
    // throw here. Neither is an error to propagate: both mean the migration has not run.
    await expect(new EponymeSchemaService(createClient(new Error('relation "_eponyme_schema" does not exist'))).verify())
      .resolves.toEqual({ ok: false, reason: 'absent' })
  })

  it('matches the version the shipped migrations write', async () => {
    // The migration that last touched `_eponyme_schema` is the one that decides what a
    // correctly migrated database reports. If they drift, every install reports a mismatch.
    const { readFileSync, readdirSync } = await import('node:fs')
    const dir = new URL('../playground/prisma/migrations/', import.meta.url)
    // Two shapes write it: the INSERT that seeds the row, and the UPDATE each later
    // migration uses to move it forward.
    const SEEDED = /VALUES\s*\('eponyme',\s*(\d+)/g
    const UPDATED = /SET\s+"version"\s*=\s*(\d+)/g
    const written = readdirSync(dir).sort().flatMap((name) => {
      let sql: string
      try {
        sql = readFileSync(new URL(`${name}/migration.sql`, dir), 'utf8')
      }
      catch {
        return []
      }
      if (!sql.includes('_eponyme_schema')) return []
      return [...sql.matchAll(SEEDED), ...sql.matchAll(UPDATED)].map(match => Number(match[1]))
    })

    expect(written.length).toBeGreaterThan(0)
    expect(Math.max(...written)).toBe(EPONYME_SCHEMA_VERSION)
  })
})
