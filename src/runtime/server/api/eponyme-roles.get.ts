import { defineEventHandler } from 'h3'
import { getEponymeRoleOptions, requireEponymePermission } from '../utils/eponyme-permissions'

export default defineEventHandler(async (event) => {
  await requireEponymePermission(event, 'users.manage', { kind: 'system', name: 'users' })
  return { roles: getEponymeRoleOptions() }
})
