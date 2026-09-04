import type { EponymeHooks } from './hooks'

// `nitropack/types` is where `NitroApp.hooks` reads `NitroRuntimeHooks` from, so the augmentation has to
// target that specifier and no other.
declare module 'nitropack/types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface NitroRuntimeHooks extends EponymeHooks {}
}

export {}
