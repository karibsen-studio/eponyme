type EponymeRow = { name: string, data: Record<string, unknown>, updatedAt?: Date }

const rows = new Map<string, EponymeRow>()
// Mirrors Prisma's `@updatedAt`, which the store relies on as an optimistic lock.
let clock = 0
const stamp = () => new Date(++clock)
const versions: Array<{ id: number, entryName: string, data: unknown, action: string, status: string, createdAt: Date, userId?: string | null }> = []
type UserRow = {
  id: string
  username: string
  usernameNormalized: string
  passwordHash: string
  role: string
  active: boolean
  mustChangePassword: boolean
  failedLoginAttempts: number
  lockedUntil: Date | null
  createdAt: Date
  updatedAt: Date
}
type SessionRow = { id: string, tokenHash: string, userId: string, expiresAt: Date, createdAt: Date }
const users = new Map<string, UserRow>([
  ['test-owner', {
    id: 'test-owner',
    username: 'EponymeOwner',
    usernameNormalized: 'eponymeowner',
    passwordHash: 'scrypt$testsalt$F_LvEm7NtUpzPJOgawDxq3R9cTmxF8eF7n21Q9NDFoAkTG2SO4RSz10uok8TbBp8gANogNXrCgx0Ygns-yORtQ',
    role: 'owner',
    active: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }],
])
const sessions = new Map<string, SessionRow>()
type FormSubmissionRow = { id: string, formName: string, data: Record<string, unknown>, createdAt: Date }
const formSubmissions = new Map<string, FormSubmissionRow>()

// Test double for a consumer-owned PrismaClient.
export default {
  eponyme: {
    async upsert({ where, create, update }: { where: { name: string }, create: EponymeRow, update: { data?: Record<string, unknown> } }) {
      const existing = rows.get(where.name)
      if (existing && !update.data) return { ...existing, data: { ...existing.data } }
      const row = existing
        ? { ...existing, data: update.data ?? existing.data, updatedAt: stamp() }
        : { name: create.name, data: create.data, updatedAt: stamp() }
      rows.set(where.name, row)
      return { ...row, data: { ...row.data } }
    },
    async update({ where, data }: { where: { name: string }, data: { data: Record<string, unknown> } }) {
      const current = rows.get(where.name)
      if (!current) throw new Error('Row not found')
      const row = { ...current, data: data.data, updatedAt: stamp() }
      rows.set(where.name, row)
      return { ...row, data: { ...row.data } }
    },
    async updateMany({ where, data }: { where: { name: string, updatedAt?: Date | string }, data: { data: Record<string, unknown> } }) {
      const current = rows.get(where.name)
      if (!current) return { count: 0 }
      if (where.updatedAt && new Date(where.updatedAt).getTime() !== current.updatedAt?.getTime()) return { count: 0 }
      rows.set(where.name, { ...current, data: data.data, updatedAt: stamp() })
      return { count: 1 }
    },
    async create({ data }: { data: EponymeRow }) {
      if (rows.has(data.name)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
      const row = { ...data, updatedAt: stamp() }
      rows.set(data.name, row)
      return row
    },
    async findUnique({ where }: { where: { name: string } }) {
      return rows.get(where.name) ?? null
    },
    async findMany({ where }: { where: { name: { startsWith: string } } }) {
      return [...rows.values()].filter(row => row.name.startsWith(where.name.startsWith))
    },
    async delete({ where }: { where: { name: string } }) {
      const row = rows.get(where.name)
      if (!row) throw new Error('Row not found')
      rows.delete(where.name)
      return row
    },
  },
  eponymeVersion: {
    async create({ data }: { data: { entryName: string, data: Record<string, unknown>, action: string, status: string, userId?: string | null } }) {
      const version = { id: versions.length + 1, ...data, createdAt: new Date() }
      versions.push(version)
      return version
    },
    async findMany({ where, take, include }: { where: { entryName: string }, take: number, include?: { user: true } }) {
      const rows = versions.filter(version => version.entryName === where.entryName).slice(-take).reverse()
      if (!include?.user) return rows
      return rows.map((version) => {
        const user = version.userId ? users.get(version.userId) : undefined
        return { ...version, user: user ? { id: user.id, username: user.username } : null }
      })
    },
    async findUnique({ where }: { where: { id: number } }) {
      return versions.find(version => version.id === where.id) ?? null
    },
  },
  eponymeFormSubmission: {
    async create({ data }: { data: FormSubmissionRow }) {
      const row = { ...data, createdAt: data.createdAt ?? new Date() }
      formSubmissions.set(row.id, row)
      return row
    },
    async findMany({ where, skip, take }: { where: { formName: string }, skip: number, take: number }) {
      return [...formSubmissions.values()]
        .filter(row => row.formName === where.formName)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(skip, skip + take)
    },
    async count({ where }: { where: { formName: string } }) {
      return [...formSubmissions.values()].filter(row => row.formName === where.formName).length
    },
    async findUnique({ where }: { where: { id: string } }) {
      return formSubmissions.get(where.id) ?? null
    },
    async delete({ where }: { where: { id: string } }) {
      const row = formSubmissions.get(where.id)
      if (!row) throw new Error('Submission not found')
      formSubmissions.delete(where.id)
      return row
    },
    async deleteMany({ where }: { where: { formName: string } }) {
      let count = 0
      for (const row of [...formSubmissions.values()]) {
        if (row.formName !== where.formName) continue
        formSubmissions.delete(row.id)
        count++
      }
      return { count }
    },
  },
  eponymeUser: {
    async count({ where }: { where?: Record<string, unknown> } = {}) {
      return [...users.values()].filter(user => !where || Object.entries(where).every(([key, value]) => user[key as keyof UserRow] === value)).length
    },
    async create({ data }: { data: Omit<UserRow, 'createdAt' | 'updatedAt' | 'lockedUntil'> & { lockedUntil?: Date | null } }) {
      if ([...users.values()].some(user => user.usernameNormalized === data.usernameNormalized))
        throw new Error('Unique constraint')
      const user = { ...data, lockedUntil: data.lockedUntil ?? null, createdAt: new Date(), updatedAt: new Date() }
      users.set(user.id, user)
      return user
    },
    async findUnique({ where }: { where: { id?: string, usernameNormalized?: string } }) {
      if (where.id) return users.get(where.id) ?? null
      return [...users.values()].find(user => user.usernameNormalized === where.usernameNormalized) ?? null
    },
    async findMany() {
      return [...users.values()]
    },
    async update({ where, data }: { where: { id: string }, data: Partial<UserRow> }) {
      const user = users.get(where.id)
      if (!user) throw new Error('User not found')
      const updated = { ...user, ...data, updatedAt: new Date() }
      users.set(where.id, updated)
      return updated
    },
  },
  eponymeUserSession: {
    async create({ data }: { data: SessionRow }) {
      const session = { ...data, createdAt: data.createdAt ?? new Date() }
      sessions.set(session.id, session)
      return session
    },
    async findUnique({ where }: { where: { tokenHash: string } }) {
      const session = [...sessions.values()].find(item => item.tokenHash === where.tokenHash)
      return session ? { ...session, user: users.get(session.userId) } : null
    },
    async delete({ where }: { where: { id?: string, tokenHash?: string } }) {
      const session = where.id
        ? sessions.get(where.id)
        : [...sessions.values()].find(item => item.tokenHash === where.tokenHash)
      if (!session) throw new Error('Session not found')
      sessions.delete(session.id)
      return session
    },
    async deleteMany({ where }: { where: { userId?: string, tokenHash?: string } }) {
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
