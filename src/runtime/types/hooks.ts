import type { EponymeAction, EponymeStatus } from './eponyme'

export interface EponymeEntryContext {
  /** Full entry name, `homepage` or `articles/my-article`. */
  name: string
  /** Collection name and slug when the entry belongs to one. */
  collection?: { name: string, slug: string }
  action: EponymeAction | 'restore' | 'import'
  status: EponymeStatus
  publishedAt: string | null
  scheduledPublishAt: string | null
  scheduledUnpublishAt: string | null
  data: Record<string, unknown>
  /** Author of the write, absent for an unattended one. */
  userId?: string
}

/** Mutating `data` here changes what gets written. */
export interface EponymeEntryBeforeSaveContext {
  name: string
  collection?: { name: string, slug: string }
  action: EponymeAction
  data: Record<string, unknown>
  userId?: string
}

/** Trash moves carry no content: the entry is untouched, only its availability changed. */
export interface EponymeEntryTrashContext {
  /** Full entry name, `articles/my-article`. Only collection entries can be trashed. */
  name: string
  collection: { name: string, slug: string }
  /** Author of the move, absent for an unattended one. */
  userId?: string
}

export interface EponymeFormSubmissionContext {
  form: string
  data: Record<string, unknown>
  /** Absent until the submission is stored, so `undefined` in `before`. */
  id?: string
}

export interface EponymeHooks {
  'eponyme:entry:beforeSave': (context: EponymeEntryBeforeSaveContext) => void | Promise<void>
  /** After a draft save, and after an import wrote an entry that is not published. */
  'eponyme:entry:saved': (context: EponymeEntryContext) => void | Promise<void>
  /** After a publication: the usual place to purge a cache or ping a webhook. */
  'eponyme:entry:published': (context: EponymeEntryContext) => void | Promise<void>
  /** After a publication was removed while retaining its published content. */
  'eponyme:entry:unpublished': (context: EponymeEntryContext) => void | Promise<void>
  /** After one or both publication dates were scheduled. */
  'eponyme:entry:scheduled': (context: EponymeEntryContext) => void | Promise<void>
  /** After the pending publication dates were cleared. */
  'eponyme:entry:unscheduled': (context: EponymeEntryContext) => void | Promise<void>
  /** After a history version was restored as the current draft. */
  'eponyme:entry:restored': (context: EponymeEntryContext) => void | Promise<void>
  /** After a collection entry was moved to the trash. It is recoverable, nothing was destroyed. */
  'eponyme:entry:trashed': (context: EponymeEntryTrashContext) => void | Promise<void>
  /** After a collection entry was taken back out of the trash. */
  'eponyme:entry:untrashed': (context: EponymeEntryTrashContext) => void | Promise<void>
  /** After a collection entry and its whole history were deleted for good. */
  'eponyme:entry:purged': (context: EponymeEntryTrashContext) => void | Promise<void>

  /** Runs before a managed submission is stored. Throwing rejects it with a 422. */
  'eponyme:form:beforeSubmit': (context: EponymeFormSubmissionContext) => void | Promise<void>
  /** After a managed submission was stored, with its id. */
  'eponyme:form:submitted': (context: Required<EponymeFormSubmissionContext>) => void | Promise<void>
}
