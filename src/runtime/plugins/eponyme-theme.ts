import { defineNuxtPlugin, useCookie, useHead } from '#app'
import { EPONYME_THEME_COOKIE, EPONYME_THEME_MAX_AGE, isEponymeTheme } from '../utils/eponyme-theme'

export default defineNuxtPlugin(() => {
  const theme = useCookie(EPONYME_THEME_COOKIE, {
    maxAge: EPONYME_THEME_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  })

  if (import.meta.client && !isEponymeTheme(theme.value)) {
    theme.value = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }

  useHead(() => ({
    htmlAttrs: {
      class: isEponymeTheme(theme.value) ? `ep-${theme.value}` : undefined,
    },
  }))
})
