import { defineEventHandler } from 'h3'
import { useEponymeAuthService } from '../../services/eponyme-auth-service'
import { requireEponymeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireEponymeUser(event, { roles: ['owner'] })
  return { users: await useEponymeAuthService().listUsers() }
})
