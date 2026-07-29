import type { EponymeCaptchaVerifier } from '../types/captcha'

/**
 * Stands in when no adapter is installed. It never claims success, so a form that
 * requires a captcha refuses submissions rather than silently accepting them all.
 */
const verifier: EponymeCaptchaVerifier = {
  name: 'none',
  verify: async () => ({ success: false, reason: 'No captcha adapter is installed.' }),
}

export default verifier
