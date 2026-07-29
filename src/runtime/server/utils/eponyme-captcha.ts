import { getRequestIP } from 'h3'
import type { H3Event } from 'h3'
import captchaVerifier from '#eponyme/captcha'
import type { EponymeCaptchaResult, EponymeCaptchaVerifier } from '../../types/captcha'

export const CAPTCHA_TOKEN_KEY = '_eponyme_captcha'

export function eponymeCaptchaVerifier(): EponymeCaptchaVerifier {
  return captchaVerifier as EponymeCaptchaVerifier
}

export function isEponymeCaptchaConfigured(): boolean {
  return eponymeCaptchaVerifier().name !== 'none'
}

export async function verifyEponymeCaptcha(event: H3Event, token: unknown): Promise<EponymeCaptchaResult> {
  if (typeof token !== 'string' || !token.trim())
    return { success: false, reason: 'Missing captcha token.' }
  // `xForwardedFor` because a public form is typically served behind a proxy.
  return eponymeCaptchaVerifier().verify(token, { ip: getRequestIP(event, { xForwardedFor: true }) })
}
