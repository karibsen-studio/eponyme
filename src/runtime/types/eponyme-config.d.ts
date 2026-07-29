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

declare module '#eponyme/captcha' {
  import type { EponymeCaptchaVerifier } from './captcha'

  const verifier: EponymeCaptchaVerifier
  export default verifier
}
