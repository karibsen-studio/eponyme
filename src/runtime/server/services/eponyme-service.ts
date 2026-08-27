import eponymeConfig from '#eponyme/config'
import prisma from '#eponyme/prisma'
import { useRuntimeConfig, useStorage } from 'nitropack/runtime'
import type { EponymeSharedCacheStorage } from './eponyme-cache-store'
import { EponymeService } from './eponyme-store'
import type { PrismaEponymeClient } from './eponyme-store'

export { EponymeService } from './eponyme-store'

// Built on first use rather than on import: `useRuntimeConfig()` is only available
// once Nitro is running, and the service needs its cache duration from there.
let eponymeService: EponymeService | undefined

export function useEponymeService(): EponymeService {
  if (!eponymeService) {
    const contentConfig = useRuntimeConfig().eponymeContent as ReturnType<typeof useRuntimeConfig>['eponymeContent'] & {
      cacheStorage?: string
    }
    eponymeService = new EponymeService(eponymeConfig, prisma as unknown as PrismaEponymeClient, {
      cacheSeconds: contentConfig.cacheSeconds,
      cacheStorage: contentConfig.cacheStorage,
      resolveCacheStorage: mount => useStorage(mount) as EponymeSharedCacheStorage,
    })
  }
  return eponymeService
}
