import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Generating a client and reading migrations need a URL that parses, never one that connects,
 * so a missing `DATABASE_URL` falls back rather than failing. Without this, `prisma generate`
 * refuses to run on a fresh clone or in CI, and every later step fails on a client that was
 * never produced.
 *
 * The running application does not share this leniency: `server/utils/prisma.ts` throws when
 * the variable is absent, so nothing can quietly talk to the placeholder.
 */
const url = process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url },
})
