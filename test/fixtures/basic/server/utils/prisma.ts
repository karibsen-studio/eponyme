type EponymeColumns = {
  draft: Record<string, unknown>
  published: Record<string, unknown>
  status: string
  publishedAt: Date | null
  scheduledPublishAt: Date | null
  scheduledUnpublishAt: Date | null
}
type EponymeRow = EponymeColumns & { name: string, updatedAt?: Date, deletedAt?: Date | null }
type DeletedAtFilter = null | { not: null }
type DateFilter = null | { lte?: Date, gt?: Date }
type EponymeWhere = {
  name?: string | { startsWith: string } | { in: string[] }
  deletedAt?: DeletedAtFilter
  publishedAt?: { not: null }
  status?: string
  scheduledPublishAt?: DateFilter
  scheduledUnpublishAt?: DateFilter
  AND?: EponymeWhere[]
  OR?: EponymeWhere[]
}
type EponymeOrderBy = Record<string, 'asc' | 'desc' | { sort: 'asc' | 'desc', nulls?: 'last' }>

const matchesDeleted = (row: EponymeRow, filter: DeletedAtFilter | undefined) => {
  if (filter === undefined) return true
  return filter === null ? !row.deletedAt : Boolean(row.deletedAt)
}

const matchesWhere = (row: EponymeRow, where: EponymeWhere) => {
  const byName = where.name === undefined
    || (typeof where.name === 'string'
      ? row.name === where.name
      : 'in' in where.name ? where.name.in.includes(row.name) : row.name.startsWith(where.name.startsWith))
  if (!byName || !matchesDeleted(row, where.deletedAt)) return false
  if (where.publishedAt !== undefined && row.publishedAt === null) return false
  if (where.status !== undefined && row.status !== where.status) return false
  if (!matchesDate(row.scheduledPublishAt, where.scheduledPublishAt)) return false
  if (!matchesDate(row.scheduledUnpublishAt, where.scheduledUnpublishAt)) return false
  if (where.AND && !where.AND.every(clause => matchesWhere(row, clause))) return false
  if (where.OR && !where.OR.some(clause => matchesWhere(row, clause))) return false
  return true
}

const matchesDate = (value: Date | null, filter: DateFilter | undefined) => {
  if (filter === undefined) return true
  if (filter === null) return value === null
  if (value === null) return false
  if (filter.lte !== undefined && value > filter.lte) return false
  if (filter.gt !== undefined && value <= filter.gt) return false
  return true
}

/** Mirrors the ordering the store sends, `nulls: 'last'` included. */
const compareRows = (left: EponymeRow, right: EponymeRow, orderBy: EponymeOrderBy[]) => {
  for (const clause of orderBy) {
    const [key, raw] = Object.entries(clause)[0]!
    const spec = typeof raw === 'string' ? { sort: raw, nulls: undefined } : raw
    const value = (row: EponymeRow): string | null => key === 'name'
      ? row.name
      : key === 'updatedAt'
        ? (row.updatedAt?.toISOString() ?? null)
        : (row.publishedAt?.toISOString() ?? null)
    const a = value(left)
    const b = value(right)
    if (a === b) continue
    if (a === null || b === null) {
      if (spec.nulls === 'last') return a === null ? 1 : -1
      return a === null ? -1 : 1
    }
    return (a < b ? -1 : 1) * (spec.sort === 'asc' ? 1 : -1)
  }
  return 0
}

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
type IndexRow = { entryName: string, version: 'draft' | 'published', key: string, value: string }
type StringRange = { in?: string[], contains?: string, gte?: string, lte?: string, gt?: string, lt?: string }
// Filterable values pulled out of each entry, keyed by the table's primary key.
const indexRows = new Map<string, IndexRow>()
const indexKey = (row: IndexRow) => [row.entryName, row.version, row.key, row.value].join(' ')
const matchesValue = (value: string, filter: string | StringRange) => {
  if (typeof filter === 'string') return value === filter
  // Every operator present is ANDed, as Prisma's string filter does.
  if (filter.in && !filter.in.includes(value)) return false
  if (filter.contains !== undefined && !value.includes(filter.contains)) return false
  if (filter.gte !== undefined && value < filter.gte) return false
  if (filter.gt !== undefined && value <= filter.gt) return false
  if (filter.lte !== undefined && value > filter.lte) return false
  if (filter.lt !== undefined && value >= filter.lt) return false
  return true
}
// The recorded fingerprint per configured name, which decides what a boot rebuilds.
const indexState = new Map<string, string>()
type FormSubmissionRow = { id: string, formName: string, data: Record<string, unknown>, createdAt: Date }
const formSubmissions = new Map<string, FormSubmissionRow>()
type RateLimitRow = { key: string, count: number, expiresAt: Date }
const rateLimits = new Map<string, RateLimitRow>()

type PrismaDouble = typeof delegates

// Test double for a consumer-owned PrismaClient.
const delegates = {
  eponyme: {
    async upsert({ where, create, update }: { where: { name: string }, create: EponymeColumns & { name: string }, update: Partial<EponymeColumns> }) {
      const existing = rows.get(where.name)
      const row = existing
        ? { ...existing, ...update, updatedAt: stamp() }
        : { ...create, updatedAt: stamp() }
      rows.set(where.name, row)
      return { ...row }
    },
    async update({ where, data }: { where: { name: string }, data: EponymeColumns }) {
      const current = rows.get(where.name)
      if (!current) throw new Error('Row not found')
      const row = { ...current, ...data, updatedAt: stamp() }
      rows.set(where.name, row)
      return { ...row }
    },
    async updateMany({ where, data }: { where: { name: string, updatedAt?: Date | string, deletedAt?: DeletedAtFilter }, data: Partial<EponymeColumns> & { deletedAt?: Date | null } }) {
      const current = rows.get(where.name)
      if (!current) return { count: 0 }
      if (where.updatedAt && new Date(where.updatedAt).getTime() !== current.updatedAt?.getTime()) return { count: 0 }
      if (!matchesDeleted(current, where.deletedAt)) return { count: 0 }
      rows.set(where.name, {
        ...current,
        ...data,
        deletedAt: data.deletedAt === undefined ? current.deletedAt ?? null : data.deletedAt,
        updatedAt: stamp(),
      })
      return { count: 1 }
    },
    async create({ data }: { data: EponymeColumns & { name: string } }) {
      if (rows.has(data.name)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
      const row = { ...data, updatedAt: stamp() }
      rows.set(data.name, row)
      return row
    },
    async findUnique({ where }: { where: { name: string } }) {
      return rows.get(where.name) ?? null
    },
    async findMany({ where, orderBy, take, skip, select }: { where: EponymeWhere, orderBy?: EponymeOrderBy[], take?: number, skip?: number, select?: Record<string, true> }) {
      const matched = [...rows.values()].filter(row => matchesWhere(row, where))
      if (orderBy) matched.sort((left, right) => compareRows(left, right, orderBy))
      const from = skip ?? 0
      const page = take === undefined ? matched.slice(from) : matched.slice(from, from + take)
      // Mirrors Prisma: `select` narrows the row to exactly what was asked for.
      if (!select) return page
      return page.map(row => Object.fromEntries(
        Object.keys(select).map(key => [key, (row as unknown as Record<string, unknown>)[key]]),
      ) as unknown as EponymeRow)
    },
    async count({ where }: { where: EponymeWhere }) {
      return [...rows.values()].filter(row => matchesWhere(row, where)).length
    },
    async delete({ where }: { where: { name: string } }) {
      const row = rows.get(where.name)
      if (!row) throw Object.assign(new Error('Row not found'), { code: 'P2025' })
      rows.delete(where.name)
      // Mirrors `onDelete: Cascade` on EponymeVersion.entryName and EponymeEntryIndex.entryName.
      for (let index = versions.length - 1; index >= 0; index--)
        if (versions[index]!.entryName === where.name) versions.splice(index, 1)
      for (const [key, indexed] of indexRows) if (indexed.entryName === where.name) indexRows.delete(key)
      return row
    },
  },
  eponymeEntryIndex: {
    async deleteMany({ where }: { where: { entryName: string | { startsWith: string } } }) {
      let count = 0
      for (const [key, row] of indexRows) {
        const hit = typeof where.entryName === 'string'
          ? row.entryName === where.entryName
          : row.entryName.startsWith(where.entryName.startsWith)
        if (!hit) continue
        indexRows.delete(key)
        count++
      }
      return { count }
    },
    async createMany({ data }: { data: IndexRow[] }) {
      for (const row of data) indexRows.set(indexKey(row), row)
      return { count: data.length }
    },
    async findMany({ where }: { where: { entryName: { startsWith: string }, version: 'draft' | 'published', key: string, value: string | StringRange } }) {
      return [...indexRows.values()]
        .filter(row => row.entryName.startsWith(where.entryName.startsWith)
          && row.version === where.version
          && row.key === where.key
          && matchesValue(row.value, where.value))
        .map(row => ({ entryName: row.entryName }))
    },
  },
  eponymeIndexState: {
    async findMany() {
      return [...indexState.entries()].map(([name, fingerprint]) => ({ name, fingerprint }))
    },
    async upsert({ where, create, update }: { where: { name: string }, create: { name: string, fingerprint: string }, update: { fingerprint: string } }) {
      const fingerprint = indexState.has(where.name) ? update.fingerprint : create.fingerprint
      indexState.set(where.name, fingerprint)
      return { name: where.name, fingerprint }
    },
    async deleteMany({ where }: { where: { name: { in: string[] } } }) {
      let count = 0
      for (const name of where.name.in) if (indexState.delete(name)) count++
      return { count }
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
    async findMany({ where, skip = 0, take, orderBy, select }: {
      where: { formName: string }
      skip?: number
      take: number
      orderBy: { createdAt: 'asc' | 'desc' }
      select?: { id: true }
    }) {
      const found = [...formSubmissions.values()]
        .filter(row => row.formName === where.formName)
        .sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * (orderBy.createdAt === 'asc' ? 1 : -1))
        .slice(skip, skip + take)
      return select ? found.map(row => ({ id: row.id })) as FormSubmissionRow[] : found
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
    async deleteMany({ where }: {
      where: { formName: string, createdAt?: { lt: Date } } | { id: { in: string[] } }
    }) {
      let count = 0
      for (const row of [...formSubmissions.values()]) {
        const matches = 'id' in where
          ? where.id.in.includes(row.id)
          : row.formName === where.formName && (!where.createdAt || row.createdAt < where.createdAt.lt)
        if (!matches) continue
        formSubmissions.delete(row.id)
        count++
      }
      return { count }
    },
  },
  eponymeRateLimit: {
    async upsert({ where, create, update }: {
      where: { key: string }
      create: RateLimitRow
      update: { count: { increment: number } }
    }) {
      const current = rateLimits.get(where.key)
      const row = current
        ? { ...current, count: current.count + update.count.increment }
        : { ...create }
      rateLimits.set(row.key, row)
      return row
    },
    async deleteMany({ where }: { where: { expiresAt: { lte: Date } } }) {
      let count = 0
      for (const [key, row] of rateLimits) {
        if (row.expiresAt > where.expiresAt.lte) continue
        rateLimits.delete(key)
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

/**
 * Prisma's interactive transaction, enough of it for the store: the callback sees the same
 * delegates, transactions run one at a time as a single connection would, and a rejected
 * callback puts every table back where it found it.
 */
let queue: Promise<unknown> = Promise.resolve()
function $transaction<T>(fn: (tx: PrismaDouble) => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const snapshot = { rows: new Map(rows), versions: [...versions], index: new Map(indexRows), state: new Map(indexState), clock }
    try {
      return await fn(delegates)
    }
    catch (error) {
      rows.clear()
      for (const [name, row] of snapshot.rows) rows.set(name, row)
      indexRows.clear()
      for (const [key, row] of snapshot.index) indexRows.set(key, row)
      indexState.clear()
      for (const [name, fingerprint] of snapshot.state) indexState.set(name, fingerprint)
      versions.splice(0, versions.length, ...snapshot.versions)
      clock = snapshot.clock
      throw error
    }
  })
  queue = run.catch(() => {})
  return run
}

export default Object.assign(delegates, { $transaction })
