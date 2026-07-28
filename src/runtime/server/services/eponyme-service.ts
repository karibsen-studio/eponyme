import eponymeConfig from '#eponyme/config'
import prisma from '#eponyme/prisma'
import { EponymeService } from './eponyme-store'
import type { PrismaEponymeClient } from './eponyme-store'

export { EponymeService } from './eponyme-store'

const eponymeService = new EponymeService(eponymeConfig, prisma as PrismaEponymeClient)

export function useEponymeService() {
  return eponymeService
}
