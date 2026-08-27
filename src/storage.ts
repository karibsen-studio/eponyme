/**
 * What `eponyme.storage.ts` is written against.
 *
 * A host that stores in a bucket exports a factory from `@eponyme/storage`; one that only needs
 * to develop without a bucket uses `local()` from here.
 *
 * ```ts
 * // eponyme.storage.ts
 * import { local } from '@karibsen/eponyme/storage'
 *
 * export default local()
 * ```
 */
export { local } from './runtime/server/utils/local-storage'
export type { EponymeLocalStorageOptions } from './runtime/server/utils/local-storage'
export type {
  EponymeMediaItem,
  EponymeStorageDriver,
  EponymeStorageFactory,
  EponymeStorageFactoryContext,
  EponymeStorageListOptions,
  EponymeStorageListResult,
  EponymeStorageObject,
  EponymeStoragePutMeta,
  EponymeStorageUrlOptions,
} from './runtime/types/storage'
