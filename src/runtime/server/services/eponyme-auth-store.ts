import { t } from '#eponyme/locale'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { EponymeAuthUser, EponymeRole } from '../../types'
import { isEponymeRole } from '../../types'
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from '../utils/password'

const OWNER_USERNAME = 'EponymeOwner'
const PASSWORD_MAX_LENGTH = 128
const USERNAME_PATTERN = /^[\w.-]{3,50}$/

type DateValue = Date | string

export interface PrismaEponymeUserRow {
  id: string
  username: string
  usernameNormalized: string
  passwordHash: string
  role: string
  active: boolean
  mustChangePassword: boolean
  failedLoginAttempts: number
  lockedUntil: DateValue | null
  createdAt: DateValue
  updatedAt: DateValue
}

export interface PrismaEponymeSessionRow {
  id: string
  tokenHash: string
  userId: string
  expiresAt: DateValue
  createdAt: DateValue
  user?: PrismaEponymeUserRow
}

export interface PrismaEponymeAuthClient {
  eponymeUser: {
    count(args?: { where?: Record<string, unknown> }): Promise<number>
    create(args: { data: Record<string, unknown> }): Promise<PrismaEponymeUserRow>
    findUnique(args: { where: Record<string, unknown> }): Promise<PrismaEponymeUserRow | null>
    findMany(args: { orderBy: Record<string, 'asc' | 'desc'> }): Promise<PrismaEponymeUserRow[]>
    update(args: { where: Record<string, unknown>, data: Record<string, unknown> }): Promise<PrismaEponymeUserRow>
  }
  eponymeUserSession: {
    create(args: { data: Record<string, unknown> }): Promise<PrismaEponymeSessionRow>
    findUnique(args: { where: Record<string, unknown>, include: { user: true } }): Promise<PrismaEponymeSessionRow | null>
    delete(args: { where: Record<string, unknown> }): Promise<PrismaEponymeSessionRow>
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>
  }
  /** Optional so tests can pass a plain fake client; real Prisma clients always provide it. */
  $transaction?: <T>(fn: (tx: PrismaEponymeAuthClient) => Promise<T>, options?: { isolationLevel?: 'Serializable' }) => Promise<T>
}

export interface CreatedSession {
  token: string
  expiresAt: Date
  user: EponymeAuthUser
}

export type LoginResult
  = | { ok: true, session: CreatedSession }
    | { ok: false, reason: 'invalid' }

const dummyPasswordHash = hashPassword('Eponyme timing-safe dummy password')

export class EponymeAuthService {
  constructor(
    private readonly client: PrismaEponymeAuthClient,
    private readonly sessionDurationDays = 7,
  ) {}

  async bootstrapOwner(log: (message: string) => void = console.log): Promise<boolean> {
    if (await this.client.eponymeUser.count() > 0) return false

    const temporaryPassword = generateTemporaryPassword()
    try {
      await this.client.eponymeUser.create({
        data: {
          id: randomUUID(),
          username: OWNER_USERNAME,
          usernameNormalized: normalizeUsername(OWNER_USERNAME),
          passwordHash: await hashPassword(temporaryPassword),
          role: 'owner',
          active: true,
          mustChangePassword: true,
          failedLoginAttempts: 0,
        },
      })
    }
    catch (error) {
      if (await this.client.eponymeUser.count() > 0) return false
      throw error
    }

    log('[Eponyme] Initial owner account created. These credentials are shown only once.')
    log(`[Eponyme] Username: ${OWNER_USERNAME}`)
    log(`[Eponyme] Temporary password: ${temporaryPassword}`)
    log('[Eponyme] Sign in and change this password before using the dashboard.')
    return true
  }

  async login(username: unknown, password: unknown): Promise<LoginResult> {
    const normalized = typeof username === 'string' ? normalizeUsername(username) : ''
    // Do not hand an attacker-controlled multi-megabyte string to scrypt. The route also has
    // a byte limit; this guard protects direct service consumers and future login transports.
    const submittedPassword = typeof password === 'string' && password.length <= PASSWORD_MAX_LENGTH ? password : ''
    const user = normalized
      ? await this.client.eponymeUser.findUnique({ where: { usernameNormalized: normalized } })
      : null

    const validPassword = await verifyPassword(submittedPassword, user?.passwordHash ?? await dummyPasswordHash)
    if (!user || !user.active || !validPassword) return { ok: false, reason: 'invalid' }

    if (user.failedLoginAttempts || user.lockedUntil) {
      await this.client.eponymeUser.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    }

    return { ok: true, session: await this.createSession({ ...user, failedLoginAttempts: 0, lockedUntil: null }) }
  }

  async getSession(token: string | undefined): Promise<CreatedSession | undefined> {
    if (!token) return undefined
    const tokenHash = hashToken(token)
    const session = await this.client.eponymeUserSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
    if (!session?.user) return undefined
    if (new Date(session.expiresAt).getTime() <= Date.now() || !session.user.active) {
      await this.client.eponymeUserSession.deleteMany({ where: { tokenHash } })
      return undefined
    }
    return {
      token,
      expiresAt: new Date(session.expiresAt),
      user: toAuthUser(session.user),
    }
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return
    await this.client.eponymeUserSession.deleteMany({ where: { tokenHash: hashToken(token) } })
  }

  async changePassword(
    userId: string,
    currentPassword: unknown,
    newPassword: unknown,
  ): Promise<{ session?: CreatedSession, error?: string }> {
    const user = await this.client.eponymeUser.findUnique({ where: { id: userId } })
    if (!user || !user.active) return { error: t('server.userUnavailable') }
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.passwordHash)))
      return { error: t('server.currentPasswordWrong') }
    const passwordError = validatePassword(newPassword)
    if (passwordError) return { error: passwordError }
    if (normalizeUsername(String(newPassword)).includes(user.usernameNormalized))
      return { error: t('server.passwordContainsUsername') }
    if (await verifyPassword(String(newPassword), user.passwordHash))
      return { error: t('server.passwordUnchanged') }

    const updated = await this.client.eponymeUser.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(String(newPassword)),
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
    await this.client.eponymeUserSession.deleteMany({ where: { userId } })
    return { session: await this.createSession(updated) }
  }

  async listUsers(): Promise<EponymeAuthUser[]> {
    const users = await this.client.eponymeUser.findMany({ orderBy: { createdAt: 'asc' } })
    return users.map(toAuthUser)
  }

  async createUser(username: unknown, role: unknown): Promise<{ result?: { user: EponymeAuthUser, temporaryPassword: string }, error?: string }> {
    const usernameError = validateUsername(username)
    if (usernameError) return { error: usernameError }
    if (!isEponymeRole(role)) return { error: t('server.roleRequired') }

    const cleanUsername = String(username).trim()
    const temporaryPassword = generateTemporaryPassword()
    try {
      const user = await this.client.eponymeUser.create({
        data: {
          id: randomUUID(),
          username: cleanUsername,
          usernameNormalized: normalizeUsername(cleanUsername),
          passwordHash: await hashPassword(temporaryPassword),
          role,
          active: true,
          mustChangePassword: true,
          failedLoginAttempts: 0,
        },
      })
      return { result: { user: toAuthUser(user), temporaryPassword } }
    }
    catch (error) {
      // Only a unique-constraint violation means the username is taken; anything else is a real failure.
      if (isUniqueConstraintViolation(error)) return { error: t('server.usernameTaken') }
      throw error
    }
  }

  async updateUser(
    id: string,
    changes: { role?: unknown, active?: unknown },
    actorId?: string,
  ): Promise<{ user?: EponymeAuthUser, error?: string, notFound?: boolean }> {
    const user = await this.client.eponymeUser.findUnique({ where: { id } })
    if (!user) return { error: t('server.userNotFound'), notFound: true }
    if (changes.role !== undefined && !isEponymeRole(changes.role))
      return { error: t('server.roleRequired') }
    if (changes.active !== undefined && typeof changes.active !== 'boolean')
      return { error: t('server.activeMustBeBoolean') }

    const nextRole = (changes.role ?? user.role) as EponymeRole
    const nextActive = (changes.active ?? user.active) as boolean

    if (actorId === id && (nextRole !== user.role || nextActive !== user.active))
      return { error: t('server.selfUpdate') }
    const removesActiveOwner = user.role === 'owner' && user.active && (nextRole !== 'owner' || !nextActive)

    // Counting owners and demoting must be atomic: two concurrent demotions could otherwise
    // both see two owners and leave the instance with none, locking everyone out of the admin.
    const apply = async (tx: PrismaEponymeAuthClient): Promise<{ user?: EponymeAuthUser, error?: string }> => {
      if (removesActiveOwner) {
        const activeOwnerCount = await tx.eponymeUser.count({ where: { role: 'owner', active: true } })
        if (activeOwnerCount <= 1) return { error: t('server.lastOwner') }
      }
      const updated = await tx.eponymeUser.update({
        where: { id },
        data: { role: nextRole, active: nextActive },
      })
      return { user: toAuthUser(updated) }
    }

    const result = removesActiveOwner && this.client.$transaction
      ? await this.client.$transaction(apply, { isolationLevel: 'Serializable' })
          .catch(error => isSerializationFailure(error)
            ? { error: t('server.concurrentChange') }
            : Promise.reject(error))
      : await apply(this.client)
    if (result.error) return result
    if (!nextActive) await this.client.eponymeUserSession.deleteMany({ where: { userId: id } })
    return result
  }

  async resetPassword(id: string): Promise<{ result?: { user: EponymeAuthUser, temporaryPassword: string }, error?: string }> {
    const user = await this.client.eponymeUser.findUnique({ where: { id } })
    if (!user) return { error: t('server.userNotFound') }
    const temporaryPassword = generateTemporaryPassword()
    const updated = await this.client.eponymeUser.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
    await this.client.eponymeUserSession.deleteMany({ where: { userId: id } })
    return { result: { user: toAuthUser(updated), temporaryPassword } }
  }

  private async createSession(user: PrismaEponymeUserRow): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + this.sessionDurationDays * 24 * 60 * 60 * 1000)
    await this.client.eponymeUserSession.create({
      data: {
        id: randomUUID(),
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt,
      },
    })
    return { token, expiresAt, user: toAuthUser(user) }
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase('en-US')
}

export function validateUsername(username: unknown): string | undefined {
  if (typeof username !== 'string' || !username.trim()) return 'Username is required.'
  if (!USERNAME_PATTERN.test(username.trim()))
    return 'Username must contain 3 to 50 letters, numbers, dots, underscores or hyphens.'
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function isUniqueConstraintViolation(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002')
}

/** Postgres serialization failure surfaced by Prisma when a serializable transaction loses a race. */
function isSerializationFailure(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2034')
}

function toAuthUser(user: PrismaEponymeUserRow): EponymeAuthUser {
  return {
    id: user.id,
    username: user.username,
    role: isEponymeRole(user.role) ? user.role : 'viewer',
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAt: new Date(user.createdAt).toISOString(),
    updatedAt: new Date(user.updatedAt).toISOString(),
  }
}
