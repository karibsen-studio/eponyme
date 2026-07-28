declare module '#eponyme/config' {
  import type { EponymeConfig } from './eponyme'

  const config: EponymeConfig
  export default config
}

declare module '#eponyme/prisma' {
  const prisma: unknown
  export default prisma
}
