import { defineEventHandler } from 'h3'
import { getEponymeEventUser } from '../../utils/auth'
import { getEponymePermissions } from '../../utils/eponyme-permissions'

export default defineEventHandler(async (event) => {
  const user = await getEponymeEventUser(event) ?? null
  return { user, permissions: getEponymePermissions(user?.role) }
})
