import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#app'
import { useEponymeAuth } from '../composables/useEponymeAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useEponymeAuth()
  const user = await auth.ensureLoaded()
  const dashboardPath = ((useRuntimeConfig().public.eponyme as { dashboardPath?: string } | undefined)?.dashboardPath ?? '/__eponyme').replace(/\/$/, '')
  const loginPath = `${dashboardPath}/login`
  const changePasswordPath = `${dashboardPath}/change-password`

  if (!user)
    return navigateTo({ path: loginPath, query: { redirect: to.fullPath } })
  if (user.mustChangePassword && to.path !== changePasswordPath)
    return navigateTo(changePasswordPath)
})
