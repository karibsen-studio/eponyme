import type { ModuleOptions } from '../../module'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    eponyme?: ModuleOptions
  }

  interface NuxtOptions {
    eponyme: ModuleOptions
  }

  interface RuntimeConfig {
    eponymeAuth: {
      sessionDurationDays: number
    }
    eponymeRateLimits: {
      loginPerIp: number
      loginGlobal: number
      loginAccountFailures: number
      formPerIp: number
      formGlobal: number
    }
    eponymeContent: {
      cacheSeconds: number
      cacheStorage: string
      autoReindex: boolean
      browserCacheSeconds: number
      cdnCacheSeconds: number
    }
  }
}

declare module 'nitropack/types' {
  import type { EponymeHooks } from './hooks'

  // Interface augmentation: the body is empty by design, the point is the supertype.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface NitroRuntimeHooks extends EponymeHooks {}
}

export {}
