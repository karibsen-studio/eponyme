import { PrismaClient } from '@prisma/client'

const prismaGlobal = globalThis as typeof globalThis & { prisma?: PrismaClient }

const prisma = prismaGlobal.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production')
  prismaGlobal.prisma = prisma

export default prisma
