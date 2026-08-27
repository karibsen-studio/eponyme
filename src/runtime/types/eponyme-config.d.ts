declare module '#eponyme/config' {
  import type { EponymeConfig } from './eponyme'

  const config: EponymeConfig
  export default config
}

declare module '#eponyme/prisma' {
  const prisma: unknown
  export default prisma
}

declare module '#eponyme/roles' {
  import type { EponymeRoleDefinitions } from './permissions'

  const roles: EponymeRoleDefinitions
  export default roles
}

declare module '#eponyme/storage' {
  import type { EponymeStorageFactory } from './storage'

  /** `null` when the host declares no `eponyme.storage.ts`, which is what turns storage off. */
  const factory: EponymeStorageFactory | null
  export default factory
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
