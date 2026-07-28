import prisma from '#eponyme/prisma'
import { useRuntimeConfig } from 'nitropack/runtime'
import { EponymeAuthService } from './eponyme-auth-store'
import type { PrismaEponymeAuthClient } from './eponyme-auth-store'

let authService: EponymeAuthService | undefined

export function useEponymeAuthService(): EponymeAuthService {
  if (!authService) {
    const config = useRuntimeConfig()
    const authConfig = config.eponymeAuth as { sessionDurationDays?: number } | undefined
    authService = new EponymeAuthService(
      prisma as PrismaEponymeAuthClient,
      authConfig?.sessionDurationDays ?? 7,
    )
  }
  return authService
}
