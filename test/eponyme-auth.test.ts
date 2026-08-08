import { describe, expect, it } from 'vitest'
import {
  EponymeAuthService,
  type PrismaEponymeAuthClient,
  type PrismaEponymeSessionRow,
  type PrismaEponymeUserRow,
} from '../src/runtime/server/services/eponyme-auth-store'

function createAuthClient() {
  const users = new Map<string, PrismaEponymeUserRow>()
  const sessions = new Map<string, PrismaEponymeSessionRow>()

  const client: PrismaEponymeAuthClient = {
    eponymeUser: {
      async count({ where } = {}) {
        return [...users.values()].filter(user => !where || matches(user, where)).length
      },
      async create({ data }) {
        const usernameNormalized = String(data.usernameNormalized)
        if ([...users.values()].some(user => user.usernameNormalized === usernameNormalized))
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
        const now = new Date()
        const user: PrismaEponymeUserRow = {
          id: String(data.id),
          username: String(data.username),
          usernameNormalized,
          passwordHash: String(data.passwordHash),
          role: String(data.role),
          active: data.active !== false,
          mustChangePassword: data.mustChangePassword !== false,
          failedLoginAttempts: Number(data.failedLoginAttempts ?? 0),
          lockedUntil: data.lockedUntil instanceof Date ? data.lockedUntil : null,
          createdAt: now,
          updatedAt: now,
        }
        users.set(user.id, user)
        return user
      },
      async findUnique({ where }) {
        if (where.id) return users.get(String(where.id)) ?? null
        return [...users.values()].find(user => user.usernameNormalized === where.usernameNormalized) ?? null
      },
      async findMany() {
        return [...users.values()]
      },
      async update({ where, data }) {
        const user = users.get(String(where.id))
        if (!user) throw new Error('User not found')
        const updated = { ...user, ...data, updatedAt: new Date() } as PrismaEponymeUserRow
        users.set(updated.id, updated)
        return updated
      },
    },
    eponymeUserSession: {
      async create({ data }) {
        const session: PrismaEponymeSessionRow = {
          id: String(data.id),
          tokenHash: String(data.tokenHash),
          userId: String(data.userId),
          expiresAt: data.expiresAt as Date,
          createdAt: new Date(),
        }
        sessions.set(session.id, session)
        return session
      },
      async findUnique({ where }) {
        const session = [...sessions.values()].find(item => item.tokenHash === where.tokenHash)
        return session ? { ...session, user: users.get(session.userId) } : null
      },
      async delete({ where }) {
        const session = where.id
          ? sessions.get(String(where.id))
          : [...sessions.values()].find(item => item.tokenHash === where.tokenHash)
        if (!session) throw new Error('Session not found')
        sessions.delete(session.id)
        return session
      },
      async deleteMany({ where }) {
        let count = 0
        for (const session of sessions.values()) {
          if (where.userId && session.userId !== where.userId) continue
          if (where.tokenHash && session.tokenHash !== where.tokenHash) continue
          sessions.delete(session.id)
          count++
        }
        return { count }
      },
    },
  }

  return { client, users, sessions }
}

describe('EponymeAuthService', () => {
  it('bootstraps the initial owner once and requires a password change', async () => {
    const { client, users } = createAuthClient()
    const service = new EponymeAuthService(client)
    const logs: string[] = []

    await expect(service.bootstrapOwner(message => logs.push(message))).resolves.toBe(true)
    await expect(service.bootstrapOwner(message => logs.push(message))).resolves.toBe(false)
    expect(users.size).toBe(1)
    expect(logs.filter(line => line.includes('Temporary password:'))).toHaveLength(1)

    const temporaryPassword = logs.find(line => line.includes('Temporary password:'))!.split(': ').at(-1)!
    const login = await service.login('eponymeowner', temporaryPassword)
    expect(login.ok).toBe(true)
    if (!login.ok) return
    expect(login.session.user).toMatchObject({
      username: 'EponymeOwner',
      role: 'owner',
      mustChangePassword: true,
    })

    const changed = await service.changePassword(login.session.user.id, temporaryPassword, 'A completely new password!')
    expect(changed.session?.user.mustChangePassword).toBe(false)
    await expect(service.login('EponymeOwner', temporaryPassword)).resolves.toMatchObject({ ok: false })
    await expect(service.login('EponymeOwner', 'A completely new password!')).resolves.toMatchObject({ ok: true })
  })

  it('creates temporary accounts, revokes sessions and protects the last owner', async () => {
    const { client } = createAuthClient()
    const service = new EponymeAuthService(client)
    const logs: string[] = []
    await service.bootstrapOwner(message => logs.push(message))
    const ownerPassword = logs.find(line => line.includes('Temporary password:'))!.split(': ').at(-1)!
    const ownerLogin = await service.login('EponymeOwner', ownerPassword)
    if (!ownerLogin.ok) throw new Error('Owner login failed')

    const created = await service.createUser('ContentEditor', 'editor')
    expect(created.result).toMatchObject({
      user: { username: 'ContentEditor', role: 'editor', mustChangePassword: true },
    })
    const editorLogin = await service.login('contenteditor', created.result!.temporaryPassword)
    if (!editorLogin.ok) throw new Error('Editor login failed')
    await expect(service.getSession(editorLogin.session.token)).resolves.toBeDefined()

    const reset = await service.resetPassword(created.result!.user.id)
    expect(reset.result?.temporaryPassword).not.toBe(created.result!.temporaryPassword)
    await expect(service.getSession(editorLogin.session.token)).resolves.toBeUndefined()

    await expect(service.updateUser(ownerLogin.session.user.id, { role: 'viewer' })).resolves.toEqual({
      error: 'The last active owner cannot be disabled or demoted.',
    })
    const secondOwner = await service.createUser('SecondOwner', 'owner')
    await expect(service.updateUser(ownerLogin.session.user.id, { role: 'viewer' })).resolves.toMatchObject({
      user: { role: 'viewer' },
    })
    expect(secondOwner.result?.user.role).toBe('owner')
  })

  it('never lets failed passwords lock out the legitimate account', async () => {
    const { client, users } = createAuthClient()
    const service = new EponymeAuthService(client)
    const logs: string[] = []
    await service.bootstrapOwner(message => logs.push(message))
    const temporaryPassword = logs.find(line => line.includes('Temporary password:'))!.split(': ').at(-1)!

    for (let attempt = 0; attempt < 5; attempt++)
      await expect(service.login('EponymeOwner', 'incorrect password')).resolves.toMatchObject({ ok: false })

    const owner = [...users.values()][0]!
    expect(owner.lockedUntil).toBeInstanceOf(Date)
    await expect(service.login('EponymeOwner', temporaryPassword)).resolves.toEqual({ ok: false, reason: 'locked' })
  })
})

function matches(user: PrismaEponymeUserRow, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => user[key as keyof PrismaEponymeUserRow] === value)
}
