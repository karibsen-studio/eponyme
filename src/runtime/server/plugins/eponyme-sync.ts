import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeAuthService } from '../services/eponyme-auth-service'
import { useEponymeFormService } from '../services/eponyme-form-service'
import { useEponymeRateLimitService } from '../services/eponyme-rate-limit-service'
import { useEponymeSchemaService } from '../services/eponyme-schema-service'
import { EPONYME_SCHEMA_VERSION } from '../services/eponyme-schema-store'
import { useEponymeService } from '../services/eponyme-service'

export default defineNitroPlugin(async () => {
  // First, because it explains every failure that would otherwise follow. A database left
  // behind fails the next three checks one column at a time; this one names the cause once.
  //
  // Raising here surfaces as an unhandled rejection and Nitro keeps serving, which is what
  // every check in this plugin already does. The value is a single accurate line in the logs
  // at boot rather than a scattering of column errors on the first request.
  const schema = await useEponymeSchemaService().verify()
  if (!schema.ok && schema.reason === 'ahead') {
    // Still served: a newer Eponyme only ever adds to the schema, so this build finds
    // everything it needs. Said out loud because the deployment is behind its own database.
    console.warn(
      `[Eponyme] The database is at schema version ${schema.version}, ahead of the ${EPONYME_SCHEMA_VERSION} this build expects. `
      + 'It was migrated by a newer Eponyme. Upgrade the module, or expect features it does not know about to be invisible.',
    )
  }
  else if (!schema.ok) {
    throw new Error(
      schema.reason === 'absent'
        ? `[Eponyme] Schema version unknown: \`_eponyme_schema\` is missing. Run \`eponyme init\` then apply the Prisma migrations, and check with \`eponyme check\`.`
        : `[Eponyme] The database is at schema version ${schema.version}, behind the ${EPONYME_SCHEMA_VERSION} this build requires. `
          + 'Apply the pending Prisma migrations before starting the application, and check with `eponyme check`.',
    )
  }

  try {
    await useEponymeRateLimitService().verify()
  }
  catch (error) {
    throw new Error(
      '[Eponyme] Rate-limit bootstrap failed. Apply the EponymeRateLimit Prisma migration before starting the application.',
      { cause: error },
    )
  }
  try {
    await useEponymeFormService().pruneStoredSubmissions()
  }
  catch (error) {
    throw new Error(
      '[Eponyme] Form-submission retention failed. Apply the EponymeFormSubmission Prisma migration before starting the application.',
      { cause: error },
    )
  }
  try {
    await useEponymeAuthService().bootstrapOwner()
  }
  catch (error) {
    throw new Error(
      '[Eponyme] Authentication bootstrap failed. Apply the EponymeUser and EponymeUserSession Prisma migration before starting the application.',
      { cause: error },
    )
  }
  await useEponymeService().syncAll()

  // After `syncAll`, never beside it: that is the one place singletons are healed, and the
  // index is built from what is stored. Indexing first would record pre-heal values.
  if (useRuntimeConfig().eponymeContent.autoReindex === false) return
  try {
    await useEponymeService().syncIndexState()
  }
  catch (error) {
    // Loud rather than silent. A stale index is a public listing that quietly returns fewer
    // entries than it should, which nobody notices; a failed boot is noticed immediately.
    // `eponyme.autoReindex: false` is the way out if this ever fails on every start.
    throw new Error(
      '[Eponyme] Index rebuild failed. Apply the EponymeEntryIndex and EponymeIndexState Prisma migrations before starting the application, '
      + 'or set `eponyme.autoReindex: false` to start without it and run `reindexEponymeEntries()` by hand.',
      { cause: error },
    )
  }
})
