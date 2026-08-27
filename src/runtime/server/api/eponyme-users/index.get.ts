import { defineEventHandler } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { requireEponymePermission } from '../../utils/eponyme-permissions'

export default defineEventHandler(async (event) => {
  await requireEponymePermission(event, 'users.manage', { kind: 'system', name: 'users' })
  return { users: await useEponymeAuthService().listUsers() }
})
