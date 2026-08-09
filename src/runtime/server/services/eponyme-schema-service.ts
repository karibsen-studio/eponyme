import prisma from '#eponyme/prisma'
import { EponymeSchemaService, type PrismaEponymeSchemaClient } from './eponyme-schema-store'

let schemaService: EponymeSchemaService | undefined

export function useEponymeSchemaService(): EponymeSchemaService {
  return schemaService ??= new EponymeSchemaService(prisma as PrismaEponymeSchemaClient)
}
