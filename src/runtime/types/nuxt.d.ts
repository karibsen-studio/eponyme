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
    eponymeAudit: {
      retentionDays: number
      pruneIntervalHours: number
      /** From `EPONYME_CRON_SECRET`. Empty means the retention route refuses every caller. */
      cronSecret: string
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
    eponymeStorage: {
      prefix: string
      maxSize: number
      accept: string[]
      accessKeyId: string
      secretAccessKey: string
      sessionToken: string
    }
  }
}

export {}
