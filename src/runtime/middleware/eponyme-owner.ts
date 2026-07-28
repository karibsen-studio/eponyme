import { createError, defineNuxtRouteMiddleware } from '#app'
import { useEponymeAuth } from '../composables/useEponymeAuth'

export default defineNuxtRouteMiddleware(async () => {
  const user = await useEponymeAuth().ensureLoaded()
  if (user?.role !== 'owner')
    throw createError({ statusCode: 403, statusMessage: 'Owner access required.' })
})
