declare module '#eponyme/config' {
  import type { EponymeConfig } from './eponyme'

  const config: EponymeConfig
  export default config
}

declare module '#eponyme/prisma' {
  const prisma: unknown
  export default prisma
}

declare module '#eponyme/variables' {
  import type { EponymeVariables } from './variables'

  const variables: EponymeVariables
  export default variables
}

declare module '#eponyme/locale' {
  import type { EponymeLocaleDefinition, EponymeMessageKey } from '../locales'
  import type { EponymeTranslateParams } from '../utils/translate'

  export const locale: EponymeLocaleDefinition
  export function t(key: EponymeMessageKey, params?: EponymeTranslateParams): string
}
