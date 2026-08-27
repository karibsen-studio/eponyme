import { describe, expect, it } from 'vitest'
import {
  EponymeAuthService,
  type PrismaEponymeAuthClient,
  type PrismaEponymeAuthDelegates,
  type PrismaEponymeSessionRow,
  type PrismaEponymeUserRow,
} from '../src/runtime/server/services/eponyme-auth-store'

function createAuthClient() {
  const users = new Map<string, PrismaEponymeUserRow>()
  const sessions = new Map<string, PrismaEponymeSessionRow>()
  const auditEvents: Array<Record<string, unknown>> = []

  const delegates: PrismaEponymeAuthDelegates = {
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
    eponymeAuditEvent: {
      async create({ data }: { data: Record<string, unknown> }) {
        auditEvents.push(data)
        return data
      },
    },
  }

  const client: PrismaEponymeAuthClient = {
    ...delegates,
    async $transaction(fn) {
      const usersSnapshot = new Map(users)
      const sessionsSnapshot = new Map(sessions)
      const auditSnapshot = [...auditEvents]
      try {
        return await fn(delegates)
      }
      catch (error) {
        users.clear()
        for (const [id, user] of usersSnapshot) users.set(id, user)
        sessions.clear()
        for (const [id, session] of sessionsSnapshot) sessions.set(id, session)
        auditEvents.splice(0, auditEvents.length, ...auditSnapshot)
        throw error
      }
    },
  }

  return { client, users, sessions, auditEvents }
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
    // Another owner may demote them, which is what the last-owner rule guards.
    await expect(service.updateUser(ownerLogin.session.user.id, { role: 'viewer' }, secondOwner.result!.user.id)).resolves.toMatchObject({
      user: { role: 'viewer' },
    })
    expect(secondOwner.result?.user.role).toBe('owner')
  })

  it('refuses to let an owner demote or deactivate their own account', async () => {
    const { client } = createAuthClient()
    const service = new EponymeAuthService(client)
    await service.bootstrapOwner(() => {})
    const owner = (await service.listUsers())[0]!
    // A second owner, so the last-owner rule is not what refuses the change.
    await service.createUser('SecondOwner', 'owner')

    const message = 'You cannot change the role or the status of your own account.'
    await expect(service.updateUser(owner.id, { active: false }, owner.id)).resolves.toEqual({ error: message })
    await expect(service.updateUser(owner.id, { role: 'viewer' }, owner.id)).resolves.toEqual({ error: message })

    // Still the owner it was, and still active.
    await expect(service.updateUser(owner.id, { active: true }, owner.id)).resolves.toMatchObject({
      user: { role: 'owner', active: true },
    })
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
    expect(owner.lockedUntil).toBeNull()
    await expect(service.login('EponymeOwner', temporaryPassword)).resolves.toMatchObject({ ok: true })
  })

  it('bounds the password handed to scrypt even when the service is called directly', async () => {
    const { client } = createAuthClient()
    const service = new EponymeAuthService(client)
    const logs: string[] = []
    await service.bootstrapOwner(message => logs.push(message))

    await expect(service.login('EponymeOwner', 'x'.repeat(10_000))).resolves.toEqual({ ok: false, reason: 'invalid' })
  })

  it('accepts configured custom roles and closes sessions when their role disappears', async () => {
    const { client, users } = createAuthClient()
    const roles = ['viewer', 'editor', 'owner', 'contributor']
    const service = new EponymeAuthService(client, 7, roles)
    const created = await service.createUser('Contributor', 'contributor')
    expect(created.result?.user.role).toBe('contributor')
    await expect(service.createUser('Unknown', 'missing-role')).resolves.toMatchObject({ error: 'A valid role is required.' })

    const login = await service.login('Contributor', created.result!.temporaryPassword)
    if (!login.ok) throw new Error('Contributor login failed')
    const stored = users.get(created.result!.user.id)!
    users.set(stored.id, { ...stored, role: 'removed-role' })

    await expect(service.getSession(login.session.token)).resolves.toBeUndefined()
  })

  it('refuses the sign-in itself once the role left the file', async () => {
    const { client, users } = createAuthClient()
    const service = new EponymeAuthService(client, 7, ['viewer', 'editor', 'owner', 'contributor'])
    const created = await service.createUser('Contributor', 'contributor')
    const stored = users.get(created.result!.user.id)!
    users.set(stored.id, { ...stored, role: 'removed-role' })

    // Correct credentials, so this is not a bad-password answer: the session would be dropped
    // on the next request and the account would loop on the login page.
    await expect(service.login('Contributor', created.result!.temporaryPassword))
      .resolves.toEqual({ ok: false, reason: 'role' })
  })
})

function matches(user: PrismaEponymeUserRow, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => user[key as keyof PrismaEponymeUserRow] === value)
}
