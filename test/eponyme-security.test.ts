import { describe, expect, it } from 'vitest'
import { eponymeSecretMatches, isEponymeDashboardPath, setEponymeSecurityHeaders } from '../src/runtime/server/utils/eponyme-security'
import type { H3Event } from 'h3'

function createEvent() {
  const headers = new Map<string, string>()
  return {
    event: { node: { res: { setHeader: (name: string, value: string) => headers.set(name, value) } } } as unknown as H3Event,
    headers,
  }
}

describe('Eponyme security headers', () => {
  it('refuses to be framed, in both the modern and the legacy spelling', () => {
    const { event, headers } = createEvent()
    setEponymeSecurityHeaders(event)
    expect(headers.get('Content-Security-Policy')).toBe('frame-ancestors \'none\'')
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('same-origin')
  })

  it('covers the dashboard and everything under it, and nothing that merely looks like it', () => {
    expect(isEponymeDashboardPath('/__eponyme', '/__eponyme')).toBe(true)
    expect(isEponymeDashboardPath('/__eponyme/login', '/__eponyme')).toBe(true)
    expect(isEponymeDashboardPath('/__eponyme-public', '/__eponyme')).toBe(false)
    expect(isEponymeDashboardPath('/blog', '/__eponyme')).toBe(false)
    // No configured path is not a reason to protect the whole site.
    expect(isEponymeDashboardPath('/blog', '')).toBe(false)
    expect(isEponymeDashboardPath('/blog', '/')).toBe(false)
  })
})

describe('cron secret', () => {
  it('accepts the secret and nothing else, whatever the length', () => {
    expect(eponymeSecretMatches('s3cret', 's3cret')).toBe(true)
    expect(eponymeSecretMatches('s3cret', 's3cre')).toBe(false)
    expect(eponymeSecretMatches('s3cretx', 's3cret')).toBe(false)
    expect(eponymeSecretMatches('S3CRET', 's3cret')).toBe(false)
  })

  it('never matches when either side is missing, so an unset secret opens nothing', () => {
    expect(eponymeSecretMatches('', '')).toBe(false)
    expect(eponymeSecretMatches('s3cret', '')).toBe(false)
    expect(eponymeSecretMatches('', 's3cret')).toBe(false)
  })
})
