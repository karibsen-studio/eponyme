import { defineNitroPlugin } from 'nitropack/runtime'
import { getEponymeRoleRegistry } from '../utils/eponyme-role-registry'

export default defineNitroPlugin(() => {
  // Validate the complete registry before the first authenticated request. A deployment with a
  // removed role or a misspelled resource must fail loudly instead of changing access silently.
  getEponymeRoleRegistry()
})
