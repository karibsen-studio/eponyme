import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeAuthService } from '../services/eponyme-auth-service'
import { useEponymeFormService } from '../services/eponyme-form-service'
import { useEponymeRateLimitService } from '../services/eponyme-rate-limit-service'
import { useEponymeSchemaService } from '../services/eponyme-schema-service'
import { EPONYME_SCHEMA_VERSION } from '../services/eponyme-schema-store'
import { useEponymeService } from '../services/eponyme-service'

export default defineNitroPlugin(async () => {
  // First, because it explains every failure that would otherwise follow.
  const schema = await useEponymeSchemaService().verify()
  if (!schema.ok && schema.reason === 'ahead') {
    // Still served: a newer Eponyme only ever adds to the schema, so this build finds everything it needs.
    console.warn(
      `[Eponyme] The database is at schema version ${schema.version}, ahead of the ${EPONYME_SCHEMA_VERSION} this build expects. `
      + 'It was migrated by a newer Eponyme. Upgrade the module, or expect features it does not know about to be invisible.',
    )
  }
  else if (!schema.ok && schema.reason === 'unknown') {
    throw new Error(
      '[Eponyme] Could not read the schema version from `_eponyme_schema`. The read failed for a reason other than a '
      + 'missing table, so the migrations are not what to look at. The cause below is the original error.',
      { cause: schema.cause },
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

  // After `syncAll`, never beside it: that is the one place singletons are healed, and the index is built
  // from what is stored.
  if (useRuntimeConfig().eponymeContent.autoReindex === false) return
  try {
    await useEponymeService().syncIndexState()
  }
  catch (error) {
    // Loud rather than silent.
    throw new Error(
      '[Eponyme] Index rebuild failed. Apply the EponymeEntryIndex and EponymeIndexState Prisma migrations before starting the application, '
      + 'or set `eponyme.autoReindex: false` to start without it and run `reindexEponymeEntries()` by hand.',
      { cause: error },
    )
  }
})
