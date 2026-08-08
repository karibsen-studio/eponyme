import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeAuthService } from '../services/eponyme-auth-service'
import { useEponymeFormService } from '../services/eponyme-form-service'
import { useEponymeRateLimitService } from '../services/eponyme-rate-limit-service'
import { useEponymeService } from '../services/eponyme-service'

export default defineNitroPlugin(async () => {
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
