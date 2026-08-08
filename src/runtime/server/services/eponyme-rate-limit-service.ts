import prisma from '#eponyme/prisma'
import { EponymeRateLimitService, type PrismaEponymeRateLimitClient } from './eponyme-rate-limit-store'

let rateLimitService: EponymeRateLimitService | undefined

export function useEponymeRateLimitService(): EponymeRateLimitService {
  return rateLimitService ??= new EponymeRateLimitService(prisma as PrismaEponymeRateLimitClient)
}
