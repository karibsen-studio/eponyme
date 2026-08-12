import { defineNuxtPlugin, useCookie, useHead } from '#app'
import { watch } from 'vue'
import { useEponymeTheme } from '../composables/useEponymeTheme'
import { EPONYME_THEME_COOKIE, EPONYME_THEME_MAX_AGE, isEponymeTheme } from '../utils/eponyme-theme'

export default defineNuxtPlugin(() => {
  const themeCookie = useCookie(EPONYME_THEME_COOKIE, {
    maxAge: EPONYME_THEME_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  })
  const { theme, setTheme } = useEponymeTheme()

  if (isEponymeTheme(themeCookie.value)) {
    setTheme(themeCookie.value)
  }
  else if (import.meta.client) {
    setTheme(window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  }

  watch(theme, (value) => {
    if (isEponymeTheme(value)) themeCookie.value = value
  }, { immediate: true })

  useHead(() => ({
    htmlAttrs: {
      class: isEponymeTheme(theme.value) ? `ep-${theme.value}` : undefined,
    },
  }))
})
