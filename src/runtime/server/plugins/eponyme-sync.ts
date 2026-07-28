import { defineNitroPlugin } from 'nitropack/runtime'
import { useEponymeAuthService } from '../services/eponyme-auth-service'
import { useEponymeService } from '../services/eponyme-service'

export default defineNitroPlugin(async () => {
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
})
