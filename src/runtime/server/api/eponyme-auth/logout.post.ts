import { defineEventHandler, getCookie } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import {
  assertEponymeMutationOrigin,
  clearEponymeSessionCookie,
  EPONYME_SESSION_COOKIE,
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertEponymeMutationOrigin(event)
  await useEponymeAuthService().logout(getCookie(event, EPONYME_SESSION_COOKIE))
  clearEponymeSessionCookie(event)
  return { loggedOut: true }
})
