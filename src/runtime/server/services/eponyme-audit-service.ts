import prisma from '#eponyme/prisma'
import { EponymeAuditService, type PrismaEponymeAuditClient } from './eponyme-audit-store'

let auditService: EponymeAuditService | undefined

export function useEponymeAuditService(): EponymeAuditService {
  auditService ??= new EponymeAuditService(prisma as unknown as PrismaEponymeAuditClient)
  return auditService
}
