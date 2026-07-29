import { defineEventHandler, setResponseHeader } from 'h3'
import { useEponymeService } from '../services/eponyme-service'
import { requireEponymeUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  await requireEponymeUser(event, { roles: ['editor', 'owner'] })
  // An export carries drafts, so no cache may ever hold on to it.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const file = await useEponymeService().exportContent()
  const day = file.eponyme.exportedAt.slice(0, 10)
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="eponyme-export-${day}.json"`)
  return file
})
