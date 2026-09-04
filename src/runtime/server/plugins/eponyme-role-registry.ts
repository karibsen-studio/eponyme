import { defineNitroPlugin } from 'nitropack/runtime'
import { getEponymeRoleRegistry } from '../utils/eponyme-role-registry'

export default defineNitroPlugin(() => {
  // Validate the complete registry before the first authenticated request.
  getEponymeRoleRegistry()
})
