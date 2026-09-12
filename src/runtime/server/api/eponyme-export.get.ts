import { defineEventHandler, setResponseHeader } from 'h3'
import { useEponymeService } from '../services/eponyme-service'
import { requireEponymePermission } from '../utils/eponyme-permissions'
import { recordEponymeAudit } from '../utils/eponyme-audit'

export default defineEventHandler(async (event) => {
  const user = await requireEponymePermission(event, 'content.export', { kind: 'system', name: 'content' })
  // An export carries drafts, so no cache may ever hold on to it.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const file = await useEponymeService().exportContent()
  const day = file.eponyme.exportedAt.slice(0, 10)
  // An export is every draft in one file: who took one, and when, is worth as much as who imported one.
  await recordEponymeAudit(event, {
    actor: user,
    action: 'content.exported',
    resourceType: 'system',
    resourceName: 'content',
    metadata: { entries: file.entries.length },
  })
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="eponyme-export-${day}.json"`)
  return file
})
