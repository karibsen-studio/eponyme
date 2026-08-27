import { randomUUID } from 'node:crypto'
import { normalizeEponymeValues } from '../../utils/normalize-eponyme-values'
import type { EponymeConfig, EponymeFormDefinitionBase } from '../../types'
import { getEponymeForms } from '../../utils/get-eponyme-schemas'
import { validateEponymeData, type ValidationErrors } from '../../utils/validate-eponyme-data'

/** Kept here rather than imported, so the store stays free of H3 imports. */

type DateValue = Date | string

export interface EponymeFormSubmission {
  id: string
  formName: string
  data: Record<string, unknown>
  createdAt: string
}

export interface EponymeFormSubmissionPage {
  submissions: EponymeFormSubmission[]
  total: number
  page: number
  perPage: number
}

export interface PrismaEponymeFormSubmissionRow {
  id: string
  formName: string
  data: unknown
  createdAt: DateValue
}

/**
 * One clause per searchable field, ORed together. `path` is the Postgres form, a key list.
 *
 * `mode` is not decoration: without it Postgres matches the JSON string case-sensitively, so
 * searching `grace` would miss `Grace Hopper` and no one would find an address they typed in
 * lower case. Verified against Postgres 16 rather than assumed.
 */
export interface EponymeSubmissionSearch {
  OR: Array<{ data: { path: string[], string_contains: string, mode: 'insensitive' } }>
}

export type EponymeSubmissionWhere = { formName: string } & Partial<EponymeSubmissionSearch>

export type PrismaEponymeFormClient = {
  eponymeFormSubmission: {
    create(args: { data: { id: string, formName: string, data: Record<string, unknown> } }): Promise<PrismaEponymeFormSubmissionRow>
    findMany(args: {
      where: EponymeSubmissionWhere
      orderBy: { createdAt: 'asc' | 'desc' }
      skip?: number
      take: number
      select?: { id: true }
    }): Promise<PrismaEponymeFormSubmissionRow[]>
    count(args: { where: EponymeSubmissionWhere }): Promise<number>
    findUnique(args: { where: { id: string } }): Promise<PrismaEponymeFormSubmissionRow | null>
    delete(args: { where: { id: string } }): Promise<PrismaEponymeFormSubmissionRow>
    deleteMany(args: {
      where: { formName: string, createdAt?: { lt: Date } } | { id: { in: string[] } }
    }): Promise<{ count: number }>
  }
}

/**
 * Types whose stored value is free text a person would search for. `select`, `radio` and
 * `checkboxGroup` are left out on purpose: they store the option value, not the label an
 * editor reads in the table, so matching them would answer on a word nobody can see.
 */
const SEARCHABLE_TYPES = new Set(['string', 'textarea', 'email', 'phone', 'url'])

const DEFAULT_PER_PAGE = 25
const MAX_PER_PAGE = 100

export class EponymeFormService {
  private readonly forms: Record<string, EponymeFormDefinitionBase>

  constructor(config: EponymeConfig, private readonly client: PrismaEponymeFormClient) {
    this.forms = getEponymeForms(config)
  }

  getForm(name: string): EponymeFormDefinitionBase | undefined {
    return this.forms[name]
  }

  /**
   * Without this, a missing model surfaces as "Cannot read properties of
   * undefined (reading 'create')", which tells the developer nothing about the
   * two steps they actually skipped.
   */
  private submissions(): PrismaEponymeFormClient['eponymeFormSubmission'] {
    const delegate = this.client?.eponymeFormSubmission
    if (!delegate)
      throw new Error('[Eponyme] The EponymeFormSubmission model is missing from your Prisma client. Add it to your schema, run a migration, then run `prisma generate`.')
    return delegate
  }

  names(): string[] {
    return Object.keys(this.forms)
  }

  /**
   * Runs the same rules as the dashboard, in `publish` mode: a public form has no
   * draft state, so `required` and the minimum bounds always apply.
   */
  validate(name: string, payload: unknown): { data: Record<string, unknown> } | { errors: ValidationErrors } | undefined {
    const definition = this.forms[name]
    if (!definition) return undefined
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return { errors: { _form: ['Body must be an object.'] } }

    const input = payload as Record<string, unknown>
    // The honeypot is transport, not content: it must not reach validation, which only
    // knows about declared fields.
    const { [definition.honeypot || '']: _honeypot, ...submitted } = input
    const unknownKeys = Object.keys(submitted).filter(key => !Object.hasOwn(definition.fields, key))
    if (unknownKeys.length)
      return { errors: Object.fromEntries(unknownKeys.map(key => [key, ['Unknown field.']])) }

    // A stored submission holds the same canonical values an entry would.
    const rest = normalizeEponymeValues(definition.fields, submitted)
    const errors = validateEponymeData(definition.fields, rest, 'publish')
    if (Object.keys(errors).length) return { errors }
    return { data: rest }
  }

  isHoneypotTriggered(name: string, payload: unknown): boolean {
    const definition = this.forms[name]
    if (!definition || !definition.honeypot) return false
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
    const value = (payload as Record<string, unknown>)[definition.honeypot]
    return typeof value === 'string' ? value.trim().length > 0 : value != null && value !== false
  }

  async submit(name: string, payload: unknown): Promise<{ submission: EponymeFormSubmission } | { errors: ValidationErrors } | undefined> {
    const definition = this.forms[name]
    if (!definition || definition.submission.mode !== 'managed') return undefined

    const validated = this.validate(name, payload)
    if (!validated || 'errors' in validated) return validated
    await this.pruneSubmissions(name, definition, 1)
    const row = await this.submissions().create({
      data: { id: randomUUID(), formName: name, data: validated.data },
    })
    return { submission: toSubmission(row) }
  }

  /**
   * The counterpart of `submit` for a `custom` form: the host route has already decided
   * to accept the submission, so this only validates and writes. Returns `undefined`
   * when the form does not collect submissions, which the caller reports as a mistake.
   */
  async store(name: string, payload: unknown): Promise<{ submission: EponymeFormSubmission } | { errors: ValidationErrors } | undefined> {
    const definition = this.forms[name]
    if (!definition || !definition.submission.store) return undefined

    const validated = this.validate(name, payload)
    if (!validated || 'errors' in validated) return validated
    await this.pruneSubmissions(name, definition, 1)
    const row = await this.submissions().create({
      data: { id: randomUUID(), formName: name, data: validated.data },
    })
    return { submission: toSubmission(row) }
  }

  async listSubmissions(
    name: string,
    options: { page?: number, perPage?: number, search?: string } = {},
  ): Promise<EponymeFormSubmissionPage | undefined> {
    const definition = this.forms[name]
    if (!definition || !definition.submission.store) return undefined

    const perPage = clamp(options.perPage ?? DEFAULT_PER_PAGE, 1, MAX_PER_PAGE)
    const page = Math.max(1, Math.trunc(options.page ?? 1) || 1)
    const where = this.submissionWhere(definition, name, options.search)
    // The count carries the same clause, or the pager would offer pages the filter empties.
    const [rows, total] = await Promise.all([
      this.submissions().findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.submissions().count({ where }),
    ])
    return { submissions: rows.map(toSubmission), total, page, perPage }
  }

  /**
   * An empty `OR` matches nothing in Prisma, so a form with no free-text field must fall
   * back to the unfiltered clause rather than answer that it has no submissions.
   */
  private submissionWhere(definition: EponymeFormDefinitionBase, name: string, search?: string): EponymeSubmissionWhere {
    const query = search?.trim()
    if (!query) return { formName: name }
    const fields = Object.entries(definition.fields)
      .filter(([, field]) => SEARCHABLE_TYPES.has(field.type))
      .map(([field]) => field)
    if (!fields.length) return { formName: name }
    return {
      formName: name,
      OR: fields.map(field => ({ data: { path: [field], string_contains: query, mode: 'insensitive' as const } })),
    }
  }

  async getSubmission(name: string, id: string): Promise<EponymeFormSubmission | undefined> {
    if (!this.forms[name]) return undefined
    const row = await this.submissions().findUnique({ where: { id } })
    // The id is opaque, so the form name in the path has to match the stored row.
    if (!row || row.formName !== name) return undefined
    return toSubmission(row)
  }

  async deleteSubmission(name: string, id: string): Promise<boolean> {
    if (!await this.getSubmission(name, id)) return false
    await this.submissions().delete({ where: { id } })
    return true
  }

  /**
   * Scoped by form name as well as by id: the ids come from the client, and an opaque id
   * alone would let one form's page delete another form's rows.
   */
  async deleteSubmissions(name: string, ids: string[]): Promise<number | undefined> {
    const definition = this.forms[name]
    if (!definition || !definition.submission.store) return undefined
    if (!ids.length) return 0
    const { count } = await this.submissions().deleteMany({ where: { formName: name, id: { in: ids } } })
    return count
  }

  async deleteAllSubmissions(name: string): Promise<number | undefined> {
    const definition = this.forms[name]
    if (!definition || !definition.submission.store) return undefined
    const { count } = await this.submissions().deleteMany({ where: { formName: name } })
    return count
  }

  /** Applies retention and quotas at boot, even when a form no longer receives traffic. */
  async pruneStoredSubmissions(): Promise<void> {
    for (const [name, definition] of Object.entries(this.forms)) {
      if (!definition.submission.store) continue
      await this.pruneSubmissions(name, definition, 0)
    }
  }

  private async pruneSubmissions(name: string, definition: EponymeFormDefinitionBase, reservedRows: 0 | 1): Promise<void> {
    if (definition.submission.retentionDays !== false) {
      const cutoff = new Date(Date.now() - definition.submission.retentionDays * 24 * 60 * 60 * 1000)
      await this.submissions().deleteMany({ where: { formName: name, createdAt: { lt: cutoff } } })
    }

    if (definition.submission.maxStored === false) return
    const total = await this.submissions().count({ where: { formName: name } })
    const overflow = total - definition.submission.maxStored + reservedRows
    if (overflow <= 0) return
    const oldest = await this.submissions().findMany({
      where: { formName: name },
      orderBy: { createdAt: 'asc' },
      take: overflow,
      select: { id: true },
    })
    if (oldest.length)
      await this.submissions().deleteMany({ where: { id: { in: oldest.map(row => row.id) } } })
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function toSubmission(row: PrismaEponymeFormSubmissionRow): EponymeFormSubmission {
  return {
    id: row.id,
    formName: row.formName,
    data: row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {},
    createdAt: new Date(row.createdAt).toISOString(),
  }
}
