export interface EponymeCaptchaResult {
  success: boolean
  /** Provider-specific reason, surfaced in server logs rather than to the visitor. */
  reason?: string
}

/**
 * Verifies the token a visitor's captcha widget produced. Implemented by an adapter
 * package such as `@karibsen/eponyme-captcha`; the core ships none, so a project
 * without an adapter simply has no captcha.
 */
export interface EponymeCaptchaVerifier {
  name: string
  verify: (token: string, context: { ip?: string }) => Promise<EponymeCaptchaResult>
}
