import type { ModuleOptions } from '../../module'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    eponyme?: ModuleOptions
  }

  interface NuxtOptions {
    eponyme: ModuleOptions
  }
}
