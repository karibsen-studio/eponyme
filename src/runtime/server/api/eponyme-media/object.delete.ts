import { defineEventHandler, getQuery, setResponseStatus } from 'h3'
import { assertEponymeMutationOrigin } from '../../utils/auth'
import { requireEponymePermission } from '../../utils/eponyme-permissions'
import { useEponymeMediaSettings, useEponymeStorage } from '../../services/eponyme-storage'
import { assertEponymeMediaKey } from '../../utils/eponyme-media'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

export default defineEventHandler(async (event) => {
  const user = await requireEponymePermission(event, 'media.delete', { kind: 'system', name: 'media' })
  assertEponymeMutationOrigin(event)

  const key = assertEponymeMediaKey(getQuery(event).key, useEponymeMediaSettings())
  await (await useEponymeStorage()).delete(key)
  await recordEponymeAudit(event, { actor: user, action: 'media.deleted', resourceType: 'system', resourceName: key })
  setResponseStatus(event, 204)
  return null
})
