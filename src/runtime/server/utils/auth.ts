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

export async function getEponymeEventUser(event: H3Event): Promise<EponymeAuthUser | undefined> {
  return (await useEponymeAuthService().getSession(getCookie(event, EPONYME_SESSION_COOKIE)))?.user
}

export async function requireEponymeUser(
  event: H3Event,
  options: { roles?: EponymeRole[], allowPasswordChangeRequired?: boolean } = {},
): Promise<EponymeAuthUser> {
  const user = await getEponymeEventUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: t('server.authRequired') })
  if (user.mustChangePassword && !options.allowPasswordChangeRequired)
    throw createError({ statusCode: 403, statusMessage: t('server.passwordChangeRequired'), data: { code: 'PASSWORD_CHANGE_REQUIRED' } })
  if (options.roles && !options.roles.includes(user.role))
    throw createError({ statusCode: 403, statusMessage: t('server.forbidden') })
  return user
}

export function setEponymeSessionCookie(event: H3Event, token: string, expiresAt: Date): void {
  setCookie(event, EPONYME_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export function clearEponymeSessionCookie(event: H3Event): void {
  deleteCookie(event, EPONYME_SESSION_COOKIE, { path: '/' })
}

export function assertEponymeMutationOrigin(event: H3Event): void {
  const origin = getHeader(event, 'origin')
  if (!origin) return
  const requestUrl = getRequestURL(event)
  if (origin !== requestUrl.origin)
    throw createError({ statusCode: 403, statusMessage: t('server.badOrigin') })
}
