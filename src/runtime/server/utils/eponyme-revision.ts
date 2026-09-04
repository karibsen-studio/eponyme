import { t } from '#eponyme/locale'
import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { EPONYME_REVISION_HEADER } from '../../utils/eponyme-revision'

/** The token the client is writing against, or undefined when it did not send one. */
export function readEponymeRevision(event: H3Event): string | undefined {
  return getHeader(event, EPONYME_REVISION_HEADER)?.trim() || undefined
}

/**
 * Same, for the writes that must not happen blind: a restore, a trashing and an untrashing all replace or
 * hide content the caller may never have looked at.
 */
export function requireEponymeRevision(event: H3Event): string {
  const revision = readEponymeRevision(event)
  if (!revision) throw createError({ status: 428, message: t('server.revisionRequired') })
  return revision
}
