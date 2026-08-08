import { createEponymeTranslator } from '../utils/translate'
import { EPONYME_DEFAULT_LOCALE, eponymeEnglishMessages } from './index'

/**
 * What `#eponyme/locale` resolves to outside a Nuxt build — the unit tests, which import the
 * validation utilities directly, and the module's own type-check.
 *
 * It is deliberately the plain English catalogue: a test asserting a message asserts the
 * message a host with no `locale` option would see.
 */
export const locale = EPONYME_DEFAULT_LOCALE

export const t = createEponymeTranslator(eponymeEnglishMessages)
