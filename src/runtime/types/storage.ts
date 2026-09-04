/** The storage contract, declared here rather than imported from `@eponyme/storage`. */

export interface EponymeStoragePutMeta {
  contentType: string
  size: number
}

export interface EponymeStorageUrlOptions {
  expiresIn?: number
  download?: string
}

export interface EponymeStorageListOptions {
  limit?: number
  cursor?: string
  delimiter?: string
}

export interface EponymeStorageObject {
  key: string
  size: number
  lastModified: Date
}

export interface EponymeStorageListResult {
  objects: EponymeStorageObject[]
  prefixes: string[]
  cursor?: string
}

export interface EponymeStorageDriver {
  put(key: string, data: ReadableStream<Uint8Array> | Uint8Array, meta: EponymeStoragePutMeta): Promise<void>
  get(key: string): Promise<ReadableStream<Uint8Array>>
  delete(key: string): Promise<void>
  stat(key: string): Promise<EponymeStoragePutMeta | null>
  list(prefix?: string, options?: EponymeStorageListOptions): Promise<EponymeStorageListResult>
  move(from: string, to: string, meta: EponymeStoragePutMeta): Promise<void>
  url(key: string, opts?: EponymeStorageUrlOptions): Promise<string>
  presignPut?(key: string, meta: EponymeStoragePutMeta): Promise<{
    url: string
    method: 'PUT'
    headers: Record<string, string>
  }>
}

export interface EponymeStorageFactoryContext {
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
}

export type EponymeStorageFactory
  = (context: EponymeStorageFactoryContext) => EponymeStorageDriver | Promise<EponymeStorageDriver>

/** One entry of the media library, as the dashboard receives it. */
export interface EponymeMediaItem {
  key: string
  /** What a page renders; either a public URL or a signed one, depending on the driver. */
  url: string
  size: number
  /** ISO 8601, because the value crosses the JSON boundary. */
  lastModified: string
  contentType: string
}
