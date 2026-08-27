import { defineEventHandler, getCookie } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import {
  assertEponymeMutationOrigin,
  clearEponymeSessionCookie,
  EPONYME_SESSION_COOKIE,
  getEponymeEventUser,
} from '../../utils/auth'
import { recordEponymeAudit } from '../../utils/eponyme-audit'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  const user = await getEponymeEventUser(event)
  await useEponymeAuthService().logout(getCookie(event, EPONYME_SESSION_COOKIE))
  if (user) {
    await recordEponymeAudit(event, {
      actor: user,
      action: 'auth.logout',
      resourceType: 'system',
      resourceName: 'authentication',
      connection: true,
    })
  }
  clearEponymeSessionCookie(event)
  return { loggedOut: true }
})
