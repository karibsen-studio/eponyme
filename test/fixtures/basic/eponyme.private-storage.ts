import { local } from '../../../src/storage'

/** Used by the private-media suite, so its objects never share a directory with the public fixture. */
export default local({ dir: '.eponyme/test-private-media' })
