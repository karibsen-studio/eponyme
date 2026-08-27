import { defineNuxtPlugin, useCookie, useHead, useRoute, useRuntimeConfig } from '#app'
import { computed, watch } from 'vue'
import { useEponymeTheme } from '../composables/useEponymeTheme'
import {
  EPONYME_THEME_COOKIE,
  EPONYME_THEME_MAX_AGE,
  isEponymeDashboardRoute,
  isEponymeTheme,
} from '../utils/eponyme-theme'

export default defineNuxtPlugin(() => {
  const route = useRoute()
  const dashboardPath = (useRuntimeConfig().public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? '/__eponyme'
  const isDashboardRoute = computed(() => isEponymeDashboardRoute(route.path, dashboardPath))
  const themeCookie = useCookie(EPONYME_THEME_COOKIE, {
    maxAge: EPONYME_THEME_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  })
  const { theme, setTheme } = useEponymeTheme()

  function initializeTheme() {
    if (isEponymeTheme(theme.value)) return
    if (isEponymeTheme(themeCookie.value)) {
      setTheme(themeCookie.value)
    }
    else if (import.meta.client) {
      setTheme(window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    }
  }

  watch(isDashboardRoute, (active) => {
    if (active) {
      initializeTheme()
      if (isEponymeTheme(theme.value) && themeCookie.value !== theme.value)
        themeCookie.value = theme.value
    }
    else if (import.meta.client) {
      document.documentElement.classList.remove('ep-light', 'ep-dark')
    }
  }, { immediate: true })

  watch(theme, (value) => {
    if (isDashboardRoute.value && isEponymeTheme(value)) themeCookie.value = value
  })

  useHead(() => ({
    htmlAttrs: {
      class: isDashboardRoute.value && isEponymeTheme(theme.value) ? `ep-${theme.value}` : undefined,
    },
  }))
})
