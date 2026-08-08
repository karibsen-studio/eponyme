import { describe, expect, it } from 'vitest'
import {
  EponymeRateLimitService,
  type PrismaEponymeRateLimitClient,
} from '../src/runtime/server/services/eponyme-rate-limit-store'

function createRateLimitClient() {
  const rows = new Map<string, { key: string, count: number, expiresAt: Date }>()
  const client: PrismaEponymeRateLimitClient = {
    eponymeRateLimit: {
      async upsert({ where, create, update }) {
        const current = rows.get(where.key)
        const row = current
          ? { ...current, count: current.count + update.count.increment }
          : { ...create }
        rows.set(row.key, row)
        return row
      },
      async deleteMany({ where }) {
        let count = 0
        for (const [key, row] of rows) {
          if (row.expiresAt > where.expiresAt.lte) continue
          rows.delete(key)
          count++
        }
        return { count }
      },
    },
  }
  return { client, rows }
}

describe('EponymeRateLimitService', () => {
  it('shares one atomic counter for a scope and fixed window', async () => {
    const { client } = createRateLimitClient()
    const service = new EponymeRateLimitService(client)
    const now = new Date('2026-08-08T12:00:00.000Z')
    const policy = { limit: 2, windowMs: 60_000 }

    await expect(service.consume('login:ip:127.0.0.1', policy, now)).resolves.toMatchObject({ allowed: true, remaining: 1 })
    await expect(service.consume('login:ip:127.0.0.1', policy, now)).resolves.toMatchObject({ allowed: true, remaining: 0 })
    await expect(service.consume('login:ip:127.0.0.1', policy, now)).resolves.toMatchObject({ allowed: false, remaining: 0 })
  })

  it('starts a fresh counter in the next window and never stores the raw scope', async () => {
    const { client, rows } = createRateLimitClient()
    const service = new EponymeRateLimitService(client)
    const policy = { limit: 1, windowMs: 60_000 }

    await service.consume('form:contact:ip:personal-address', policy, new Date('2026-08-08T12:00:59.000Z'))
    await expect(service.consume('form:contact:ip:personal-address', policy, new Date('2026-08-08T12:01:00.000Z')))
      .resolves.toMatchObject({ allowed: true, remaining: 0 })
    expect(rows.size).toBe(2)
    expect([...rows.keys()].every(key => !key.includes('personal-address'))).toBe(true)
  })

  it('verifies the persistence delegate and removes expired windows at boot', async () => {
    const { client, rows } = createRateLimitClient()
    rows.set('expired', { key: 'expired', count: 3, expiresAt: new Date('2026-08-08T11:59:59.000Z') })
    rows.set('active', { key: 'active', count: 1, expiresAt: new Date('2026-08-08T12:01:00.000Z') })

    await new EponymeRateLimitService(client).verify(new Date('2026-08-08T12:00:00.000Z'))

    expect([...rows.keys()]).toEqual(['active'])
  })
})
