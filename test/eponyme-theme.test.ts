import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { EPONYME_THEME_BOOTSTRAP } from '../src/runtime/utils/eponyme-theme'

function runThemeBootstrap(cookie = '', prefersLight = false) {
  const classes = new Set(['ep-dark'])
  let nextCookie = cookie

  runInNewContext(EPONYME_THEME_BOOTSTRAP, {
    document: {
      get cookie() {
        return nextCookie
      },
      set cookie(value: string) {
        nextCookie = value
      },
      documentElement: {
        classList: {
          add: (...names: string[]) => names.forEach(name => classes.add(name)),
          remove: (...names: string[]) => names.forEach(name => classes.delete(name)),
        },
      },
    },
    location: { protocol: 'https:' },
    window: {
      matchMedia: () => ({ matches: prefersLight }),
    },
  })

  return { classes, cookie: nextCookie }
}

describe('Eponyme theme bootstrap', () => {
  it('uses the system preference and stores it on the first visit', () => {
    const result = runThemeBootstrap('', true)

    expect(result.classes).toEqual(new Set(['ep-light']))
    expect(result.cookie).toContain('eponyme-theme=light')
    expect(result.cookie).toContain('Max-Age=31536000')
    expect(result.cookie).toContain('SameSite=Lax')
    expect(result.cookie).toContain('Secure')
  })

  it('keeps a valid stored preference instead of reading the system preference again', () => {
    const result = runThemeBootstrap('eponyme-theme=dark', true)

    expect(result.classes).toEqual(new Set(['ep-dark']))
    expect(result.cookie).toBe('eponyme-theme=dark')
  })
})
