import { createError, defineNuxtRouteMiddleware } from '#app'
import type { EponymePermissionAction, EponymeResource } from '../types/permissions'
import { useEponymeAuth } from '../composables/useEponymeAuth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Checked before the page renders, with the same rules the matching API route applies. */
    eponymePermission?: { action: EponymePermissionAction, resource: EponymeResource }
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useEponymeAuth()
  await auth.ensureLoaded()
  const required = to.meta.eponymePermission
  if (required && !auth.can(required.action, required.resource))
    throw createError({ status: 403, message: 'Insufficient permissions.' })
})
