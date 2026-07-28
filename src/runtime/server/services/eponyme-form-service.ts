import eponymeConfig from '#eponyme/config'
import prisma from '#eponyme/prisma'
import { EponymeFormService } from './eponyme-form-store'
import type { PrismaEponymeFormClient } from './eponyme-form-store'

export { EponymeFormService } from './eponyme-form-store'

const eponymeFormService = new EponymeFormService(eponymeConfig, prisma as PrismaEponymeFormClient)

export function useEponymeFormService() {
  return eponymeFormService
}
