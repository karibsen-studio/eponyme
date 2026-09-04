import { createError, defineEventHandler, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useEponymeAuditService } from '../../services/eponyme-audit-service'
import { eponymeSecretMatches } from '../../utils/eponyme-security'

/** Deletes the audit events older than the configured retention, when a scheduler asks. */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event).eponymeAudit
  authorize(event, config.cronSecret)
  const deleted = await useEponymeAuditService().prune(config.retentionDays, config.pruneIntervalHours)
  return { deleted }
})

/** No session path beside the secret: `audit.read` is the right to read a log, not to erase it. */
function authorize(event: H3Event, secret: string): void {
  if (!secret) {
    throw createError({
      status: 503,
      message: 'Audit retention is not scheduled: set EPONYME_CRON_SECRET and call this route with it as a bearer token.',
    })
  }
  if (!eponymeSecretMatches(bearerToken(event), secret))
    throw createError({ status: 401, message: 'Invalid cron secret.' })
}

function bearerToken(event: H3Event): string {
  const header = getHeader(event, 'authorization')?.trim() ?? ''
  const [scheme, ...rest] = header.split(/\s+/)
  return scheme?.toLowerCase() === 'bearer' ? rest.join(' ') : ''
}
