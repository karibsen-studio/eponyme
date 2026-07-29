import { verifyTurnstileToken } from '#imports'

interface TurnstileResponse {
  'success': boolean
  'error-codes'?: string[]
}

/**
 * Matches Eponyme's `EponymeCaptchaVerifier` structurally rather than importing the
 * type, so this package does not need a build-time dependency on the core.
 */
export default {
  name: 'turnstile',
  async verify(token: string): Promise<{ success: boolean, reason?: string }> {
    try {
      const response = await verifyTurnstileToken(token) as TurnstileResponse
      if (response?.success) return { success: true }
      // Cloudflare's codes are for the server log, never for the visitor: they would
      // tell a bot exactly which check it failed.
      return { success: false, reason: response?.['error-codes']?.join(', ') || 'Rejected by Turnstile.' }
    }
    catch (error) {
      // A network failure must not read as a pass.
      return { success: false, reason: error instanceof Error ? error.message : 'Turnstile verification failed.' }
    }
  },
}
