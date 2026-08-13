import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

const prismaGlobal = globalThis as typeof globalThis & { prisma?: PrismaClient }

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString)
    throw new Error('[Eponyme] DATABASE_URL is required to initialise Prisma.')

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
}

const prisma = prismaGlobal.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production')
  prismaGlobal.prisma = prisma

export default prisma
