import { defineEventHandler } from 'h3'
import { useEponymeService } from '../services/eponyme-service'
import { requireEponymeUser } from '../utils/auth'
import { hasEponymePermission, resolveEponymeContentResource } from '../utils/eponyme-permissions'

export default defineEventHandler(async (event) => {
  const user = await requireEponymeUser(event)
  const statuses = await useEponymeService().statuses()
  return {
    statuses: Object.fromEntries(Object.entries(statuses).filter(([name]) => {
      const resource = resolveEponymeContentResource(name)
      return resource && hasEponymePermission(user.role, 'content.read', resource)
    })),
  }
})
