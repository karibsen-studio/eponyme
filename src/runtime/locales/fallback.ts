import { createEponymeTranslator } from '../utils/translate'
import { EPONYME_DEFAULT_LOCALE, eponymeEnglishMessages } from './index'

/**
 * What `#eponyme/locale` resolves to outside a Nuxt build - the unit tests, which import the validation
 * utilities directly, and the module's own type-check.
 */
export const locale = EPONYME_DEFAULT_LOCALE

export const t = createEponymeTranslator(eponymeEnglishMessages)
