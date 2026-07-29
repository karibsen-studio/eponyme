import eponymeConfig from '#eponyme/config'
import prisma from '#eponyme/prisma'
import { useRuntimeConfig } from 'nitropack/runtime'
import { EponymeService } from './eponyme-store'
import type { PrismaEponymeClient } from './eponyme-store'

export { EponymeService } from './eponyme-store'

// Built on first use rather than on import: `useRuntimeConfig()` is only available
// once Nitro is running, and the service needs its cache duration from there.
let eponymeService: EponymeService | undefined

export function useEponymeService(): EponymeService {
  if (!eponymeService) {
    const contentConfig = useRuntimeConfig().eponymeContent as { cacheSeconds?: number } | undefined
    eponymeService = new EponymeService(eponymeConfig, prisma as PrismaEponymeClient, {
      cacheSeconds: contentConfig?.cacheSeconds ?? 5,
    })
  }
  return eponymeService
}
