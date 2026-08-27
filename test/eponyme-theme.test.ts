import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  createEponymeThemeBootstrap,
  isEponymeDashboardRoute,
} from '../src/runtime/utils/eponyme-theme'

function runThemeBootstrap(path = '/__eponyme/login', cookie = '', prefersLight = false, dashboardPath = '/__eponyme') {
  const classes = new Set(['host-class', 'ep-dark'])
  let nextCookie = cookie

  runInNewContext(createEponymeThemeBootstrap(dashboardPath), {
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
    location: { pathname: path, protocol: 'https:' },
    window: {
      matchMedia: () => ({ matches: prefersLight }),
    },
  })

  return { classes, cookie: nextCookie }
}

describe('Eponyme theme bootstrap', () => {
  it('matches the dashboard route and its children without matching a sibling route', () => {
    expect(isEponymeDashboardRoute('/admin', '/admin/')).toBe(true)
    expect(isEponymeDashboardRoute('/admin/login', '/admin/')).toBe(true)
    expect(isEponymeDashboardRoute('/administrator', '/admin/')).toBe(false)
    expect(isEponymeDashboardRoute('/', '/admin/')).toBe(false)
  })

  it('uses the system preference and stores it on the first visit', () => {
    const result = runThemeBootstrap('/__eponyme/login', '', true)

    expect(result.classes).toEqual(new Set(['host-class', 'ep-light']))
    expect(result.cookie).toContain('eponyme-theme=light')
    expect(result.cookie).toContain('Max-Age=31536000')
    expect(result.cookie).toContain('SameSite=Lax')
    expect(result.cookie).toContain('Secure')
  })

  it('keeps a valid stored preference instead of reading the system preference again', () => {
    const result = runThemeBootstrap('/__eponyme', 'eponyme-theme=dark', true)

    expect(result.classes).toEqual(new Set(['host-class', 'ep-dark']))
    expect(result.cookie).toBe('eponyme-theme=dark')
  })

  it('uses the configured dashboard path in the bootstrap script', () => {
    const result = runThemeBootstrap('/admin/login', 'eponyme-theme=light', false, '/admin/')

    expect(result.classes).toEqual(new Set(['host-class', 'ep-light']))
  })

  it('removes Eponyme theme classes without changing the stored preference outside the dashboard', () => {
    const result = runThemeBootstrap('/', 'eponyme-theme=dark', true)

    expect(result.classes).toEqual(new Set(['host-class']))
    expect(result.cookie).toBe('eponyme-theme=dark')
  })
})
