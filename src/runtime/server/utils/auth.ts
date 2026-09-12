import { t } from '#eponyme/locale'
import {
  createError,
  deleteCookie,
  getCookie,
  getHeader,
  getRequestURL,
  setCookie,
} from 'h3'
import type { H3Event } from 'h3'
import type { EponymeAuthUser, EponymeRole } from '../../types'
import { useEponymeAuthService } from '../services/eponyme-auth-service'

export const EPONYME_SESSION_COOKIE = 'eponyme_session'
/**
 * `__Host-` binds the cookie to this exact origin and to a secure connection, so a subdomain - or a page
 * served over plain HTTP - cannot write a session cookie the dashboard would then read. The prefix is only
 * legal on a secure cookie, so development keeps the plain name.
 */
export const EPONYME_SESSION_COOKIE_SECURE = `__Host-${EPONYME_SESSION_COOKIE}`

function useSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function eponymeSessionCookieName(): string {
  return useSecureCookie() ? EPONYME_SESSION_COOKIE_SECURE : EPONYME_SESSION_COOKIE
}

/** Reads whichever of the two names the browser holds, so an open session survives a deployment. */
export function readEponymeSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, eponymeSessionCookieName()) ?? getCookie(event, EPONYME_SESSION_COOKIE)
}

export async function getEponymeEventUser(event: H3Event): Promise<EponymeAuthUser | undefined> {
  return (await useEponymeAuthService().getSession(readEponymeSessionCookie(event)))?.user
}

export async function requireEponymeUser(
  event: H3Event,
  options: { roles?: EponymeRole[], allowPasswordChangeRequired?: boolean } = {},
): Promise<EponymeAuthUser> {
  const user = await getEponymeEventUser(event)
  if (!user) throw createError({ status: 401, message: t('server.authRequired') })
  if (user.mustChangePassword && !options.allowPasswordChangeRequired)
    throw createError({ status: 403, message: t('server.passwordChangeRequired'), data: { code: 'PASSWORD_CHANGE_REQUIRED' } })
  if (options.roles && !options.roles.includes(user.role))
    throw createError({ status: 403, message: t('server.forbidden') })
  return user
}

// `strict` rather than `lax`: nothing outside the dashboard links into an authenticated view.
export function setEponymeSessionCookie(event: H3Event, token: string, expiresAt: Date): void {
  setCookie(event, eponymeSessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: useSecureCookie(),
    path: '/',
    expires: expiresAt,
  })
}

export function clearEponymeSessionCookie(event: H3Event): void {
  // The same attributes as the cookie being cleared: a `__Host-` name whose deletion arrives without
  // `Secure` is refused by the browser, which then keeps sending a token the server has already revoked.
  const options = { path: '/', httpOnly: true, sameSite: 'strict', secure: useSecureCookie() } as const
  const name = eponymeSessionCookieName()
  deleteCookie(event, name, options)
  // The old name too, so a session opened before this deployment is cleared - unless it is the same name.
  if (name !== EPONYME_SESSION_COOKIE) deleteCookie(event, EPONYME_SESSION_COOKIE, options)
}

/**
 * A browser sends `Origin` on every mutation, so an absent one is either a client that is not a browser or
 * a request built to skip the check. It stays allowed while no session rides on it - a public form post, a
 * machine calling the API with no cookie - and is refused as soon as the request carries the session
 * cookie, since that is the only case a forged one could use.
 */
export function assertEponymeMutationOrigin(event: H3Event): void {
  const origin = getHeader(event, 'origin')
  if (origin) {
    if (origin !== getRequestURL(event).origin)
      throw createError({ status: 403, message: t('server.badOrigin') })
    return
  }

  // Sent by browsers that omit `Origin` on a same-origin request, and unforgeable from a page.
  if (getHeader(event, 'sec-fetch-site') === 'same-origin') return
  if (readEponymeSessionCookie(event))
    throw createError({ status: 403, message: t('server.badOrigin') })
}
