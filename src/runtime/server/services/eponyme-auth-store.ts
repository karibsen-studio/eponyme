import { t } from '#eponyme/locale'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { EponymeAuthUser, EponymeRole } from '../../types'
import { EPONYME_DEFAULT_ROLES } from '../../types'
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from '../utils/password'

const OWNER_USERNAME = 'EponymeOwner'
const PASSWORD_MAX_LENGTH = 128
/**
 * How long the password printed at first boot works. A log line lives longer than a first sign-in, so the
 * secret in it stops being one; boot after this window issues a new password rather than locking the
 * installation out.
 */
const BOOTSTRAP_PASSWORD_MS = 24 * 60 * 60 * 1000
/** How often expired sessions are swept, so a token nobody reuses does not sit in the table for good. */
const SESSION_CLEANUP_MS = 60 * 60 * 1000
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

export interface PrismaEponymeAuthDelegates {
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
  eponymeAuditEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>
  }
}

export interface PrismaEponymeAuthClient extends PrismaEponymeAuthDelegates {
  $transaction: <T>(fn: (tx: PrismaEponymeAuthDelegates) => Promise<T>, options?: { isolationLevel?: 'Serializable' }) => Promise<T>
}

export interface CreatedSession {
  token: string
  expiresAt: Date
  user: EponymeAuthUser
}

export type LoginResult
  = | { ok: true, session: CreatedSession }
    | { ok: false, reason: 'invalid' | 'role' }

const dummyPasswordHash = hashPassword('Eponyme timing-safe dummy password')

export class EponymeAuthService {
  private readonly validRoles: Set<string>
  private nextSessionCleanupAt = 0

  constructor(
    private readonly client: PrismaEponymeAuthClient,
    private readonly sessionDurationDays = 7,
    roles: readonly string[] = EPONYME_DEFAULT_ROLES,
  ) {
    this.validRoles = new Set(roles)
  }

  async bootstrapOwner(log: (message: string) => void = console.log): Promise<boolean> {
    if (await this.client.eponymeUser.count() > 0) return await this.reissueBootstrapPassword(log)

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
    log(`[Eponyme] Sign in and change this password within ${BOOTSTRAP_PASSWORD_MS / (60 * 60 * 1000)} hours; after that it stops working and a new one is issued at boot.`)
    return true
  }

  /**
   * The first password is printed into whatever collects the logs, so it expires. An installation nobody
   * signed into yet gets a fresh one at the next boot instead of becoming unreachable.
   */
  private async reissueBootstrapPassword(log: (message: string) => void): Promise<boolean> {
    if (await this.client.eponymeUser.count() !== 1) return false
    const owner = await this.client.eponymeUser.findUnique({ where: { usernameNormalized: normalizeUsername(OWNER_USERNAME) } })
    if (!owner?.mustChangePassword || !isStaleBootstrap(owner)) return false

    const temporaryPassword = generateTemporaryPassword()
    await this.client.eponymeUser.update({
      where: { id: owner.id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
    log('[Eponyme] The temporary owner password had expired and was replaced.')
    log(`[Eponyme] Username: ${OWNER_USERNAME}`)
    log(`[Eponyme] Temporary password: ${temporaryPassword}`)
    return true
  }

  async login(username: unknown, password: unknown): Promise<LoginResult> {
    const normalized = typeof username === 'string' ? normalizeUsername(username) : ''
    // Do not hand an attacker-controlled multi-megabyte string to scrypt.
    const submittedPassword = typeof password === 'string' && password.length <= PASSWORD_MAX_LENGTH ? password : ''
    const user = normalized
      ? await this.client.eponymeUser.findUnique({ where: { usernameNormalized: normalized } })
      : null

    const validPassword = await verifyPassword(submittedPassword, user?.passwordHash ?? await dummyPasswordHash)
    if (!user || !user.active || !validPassword) return { ok: false, reason: 'invalid' }
    // A password that was written to the logs and never changed is refused once its window has passed. The
    // next boot prints a new one.
    if (user.mustChangePassword && isStaleBootstrap(user)) return { ok: false, reason: 'invalid' }
    // A session opened here would only last one request, since `getSession` drops it.
    if (!this.validRoles.has(user.role)) return { ok: false, reason: 'role' }

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
    void this.sweepExpiredSessions()
    const tokenHash = hashToken(token)
    const session = await this.client.eponymeUserSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
    if (!session?.user) return undefined
    if (new Date(session.expiresAt).getTime() <= Date.now()
      || !session.user.active
      || !this.validRoles.has(session.user.role)) {
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
    // Bounded before the KDF, like the login: a multi-megabyte string must never reach scrypt.
    const submitted = typeof currentPassword === 'string' && currentPassword.length <= PASSWORD_MAX_LENGTH ? currentPassword : ''
    if (!submitted || !(await verifyPassword(submitted, user.passwordHash)))
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

  async createUser(
    username: unknown,
    role: unknown,
    actor?: string | EponymeAuthUser,
  ): Promise<{ result?: { user: EponymeAuthUser, temporaryPassword: string }, error?: string }> {
    const usernameError = validateUsername(username)
    if (usernameError) return { error: usernameError }
    if (typeof role !== 'string' || !this.validRoles.has(role)) return { error: t('server.roleRequired') }

    const cleanUsername = String(username).trim()
    const temporaryPassword = generateTemporaryPassword()
    try {
      const passwordHash = await hashPassword(temporaryPassword)
      const user = await this.client.$transaction(async (tx) => {
        const created = await tx.eponymeUser.create({
          data: {
            id: randomUUID(),
            username: cleanUsername,
            usernameNormalized: normalizeUsername(cleanUsername),
            passwordHash,
            role,
            active: true,
            mustChangePassword: true,
            failedLoginAttempts: 0,
          },
        })
        await this.audit(tx, actor, 'user.created', created.id, { role, username: cleanUsername })
        return created
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
    actor?: string | EponymeAuthUser,
  ): Promise<{ user?: EponymeAuthUser, error?: string, notFound?: boolean }> {
    const user = await this.client.eponymeUser.findUnique({ where: { id } })
    if (!user) return { error: t('server.userNotFound'), notFound: true }
    if (changes.role !== undefined && (typeof changes.role !== 'string' || !this.validRoles.has(changes.role)))
      return { error: t('server.roleRequired') }
    if (changes.active !== undefined && typeof changes.active !== 'boolean')
      return { error: t('server.activeMustBeBoolean') }

    const nextRole = (changes.role ?? user.role) as EponymeRole
    const nextActive = (changes.active ?? user.active) as boolean

    if (auditActorId(actor) === id && (nextRole !== user.role || nextActive !== user.active))
      return { error: t('server.selfUpdate') }
    const removesActiveOwner = user.role === 'owner' && user.active && (nextRole !== 'owner' || !nextActive)

    // Counting owners and demoting must be atomic: two concurrent demotions could otherwise both see two
    // owners and leave the instance with none, locking everyone out of the admin.
    const apply = async (tx: PrismaEponymeAuthDelegates): Promise<{ user?: EponymeAuthUser, error?: string }> => {
      if (removesActiveOwner) {
        const activeOwnerCount = await tx.eponymeUser.count({ where: { role: 'owner', active: true } })
        if (activeOwnerCount <= 1) return { error: t('server.lastOwner') }
      }
      const updated = await tx.eponymeUser.update({
        where: { id },
        data: { role: nextRole, active: nextActive },
      })
      if (!nextActive) await tx.eponymeUserSession.deleteMany({ where: { userId: id } })
      if (nextRole !== user.role)
        await this.audit(tx, actor, 'user.role_changed', id, { previousRole: user.role, nextRole })
      if (nextActive !== user.active)
        await this.audit(tx, actor, 'user.activation_changed', id, { previousActive: user.active, nextActive })
      return { user: toAuthUser(updated) }
    }

    const result = await this.client.$transaction(
      apply,
      removesActiveOwner ? { isolationLevel: 'Serializable' } : undefined,
    ).catch(error => isSerializationFailure(error)
      ? { error: t('server.concurrentChange') }
      : Promise.reject(error))
    if (result.error) return result
    return result
  }

  async resetPassword(
    id: string,
    actor?: string | EponymeAuthUser,
  ): Promise<{ result?: { user: EponymeAuthUser, temporaryPassword: string }, error?: string }> {
    const user = await this.client.eponymeUser.findUnique({ where: { id } })
    if (!user) return { error: t('server.userNotFound') }
    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)
    const updated = await this.client.$transaction(async (tx) => {
      const changed = await tx.eponymeUser.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      })
      await tx.eponymeUserSession.deleteMany({ where: { userId: id } })
      await this.audit(tx, actor, 'user.password_reset', id)
      return changed
    })
    return { result: { user: toAuthUser(updated), temporaryPassword } }
  }

  private async audit(
    client: PrismaEponymeAuthDelegates,
    actor: string | EponymeAuthUser | undefined,
    action: string,
    targetUserId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await client.eponymeAuditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: auditActorId(actor),
        actorUsername: typeof actor === 'string' ? null : actor?.username ?? null,
        action,
        outcome: 'success',
        resourceType: 'system',
        resourceName: 'users',
        targetUserId,
        metadata: metadata ?? null,
      },
    })
  }

  /**
   * Expired rows are dropped when their own token comes back, which never happens for a session nobody
   * reuses. This sweeps those, at most once an hour and never in the way of the request.
   */
  private async sweepExpiredSessions(now = Date.now()): Promise<void> {
    if (now < this.nextSessionCleanupAt) return
    this.nextSessionCleanupAt = now + SESSION_CLEANUP_MS
    // Maintenance, never a reason to refuse a session that is otherwise valid.
    await this.client.eponymeUserSession.deleteMany({ where: { expiresAt: { lte: new Date(now) } } }).catch(() => {})
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

/** A temporary password is judged on the account's last write: creation, or the last reissue. */
function isStaleBootstrap(user: PrismaEponymeUserRow, now = Date.now()): boolean {
  return now - new Date(user.updatedAt).getTime() > BOOTSTRAP_PASSWORD_MS
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

function auditActorId(actor: string | EponymeAuthUser | undefined): string | undefined {
  return typeof actor === 'string' ? actor : actor?.id
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
    role: user.role as EponymeRole,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAt: new Date(user.createdAt).toISOString(),
    updatedAt: new Date(user.updatedAt).toISOString(),
  }
}
