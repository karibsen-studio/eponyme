import { Buffer } from 'node:buffer'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { dirname, join, relative, resolve, sep } from 'pathe'
import type {
  EponymeStorageDriver,
  EponymeStorageFactory,
  EponymeStorageListOptions,
  EponymeStorageListResult,
  EponymeStorageObject,
} from '../../types/storage'

export interface EponymeLocalStorageOptions {
  /**
   * Directory objects are written into, relative to the project root.
   *
   * @default ".eponyme/media"
   */
  dir?: string
  /**
   * Base the returned URLs are built on.
   *
   * @default "/api/eponyme-media/raw"
   */
  publicUrl?: string
}

const DEFAULT_DIR = '.eponyme/media'
const DEFAULT_PUBLIC_URL = '/api/eponyme-media/raw'
/** Sidecar holding the content type, which a filesystem has nowhere else to put. */
const TYPE_SUFFIX = '.eponyme-type'
const FALLBACK_CONTENT_TYPE = 'application/octet-stream'

function validateKey(key: string): string {
  if (typeof key !== 'string' || key === '') throw new TypeError('key must be a non-empty string')
  if (key.startsWith('/')) throw new TypeError('key must be relative')
  if (key.includes('\0') || key.includes('\\')) throw new TypeError('key contains invalid characters')
  if (key.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new TypeError('key contains an invalid path segment')
  }
  if (key.endsWith(TYPE_SUFFIX)) throw new TypeError('key is reserved')
  return key
}

function validatePrefix(prefix: string): string {
  if (typeof prefix !== 'string') throw new TypeError('prefix must be a string')
  if (prefix === '') return prefix
  if (prefix.startsWith('/')) throw new TypeError('prefix must be relative')
  if (prefix.includes('\0') || prefix.includes('\\')) throw new TypeError('prefix contains invalid characters')
  if (prefix.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new TypeError('prefix contains an invalid path segment')
  }
  return prefix
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/** A filesystem that refuses to be written to, which is the normal state of a serverless host. */
function isReadOnly(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'EROFS' || code === 'EACCES' || code === 'EPERM'
}

/** Raised instead of the errno, which says `EROFS` and nothing about what to do next. */
function readOnlyError(root: string): Error {
  return Object.assign(
    new Error(
      `[Eponyme] The local storage driver cannot write to ${root}: the filesystem is read-only. `
      + 'This is expected on a serverless host – Vercel, Netlify and the like only allow writes to a '
      + 'per-invocation temporary directory. Configure a bucket in `eponyme.storage.ts` instead.',
    ),
    { code: 'read_only' as const },
  )
}

/** A filesystem driver, so a project can develop, and run its tests, without a bucket. */
export function local(options: EponymeLocalStorageOptions = {}): EponymeStorageFactory {
  const root = resolve(process.cwd(), options.dir ?? DEFAULT_DIR)
  const publicUrl = (options.publicUrl ?? DEFAULT_PUBLIC_URL).replace(/\/+$/, '')

  // At boot rather than on the first upload: a deployment that shipped this by accident should say so in
  // its own logs, while someone is still looking at them - not days later through an editor reporting that
  // a button does nothing.
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[Eponyme] Storage is the local filesystem driver, writing to ${root}, and NODE_ENV is production. `
      + 'It keeps files on the single machine that received them, so another instance cannot read them '
      + 'back and a redeploy loses them – and on a serverless host every upload fails outright, the '
      + 'filesystem being read-only. Configure a bucket in `eponyme.storage.ts` before serving traffic.',
    )
  }

  /** Resolves inside `root` or throws: a validated key cannot escape, and this proves it. */
  const pathFor = (key: string): string => {
    const target = resolve(root, validateKey(key))
    const inside = relative(root, target)
    if (inside === '' || inside.startsWith('..') || inside.startsWith(`..${sep}`)) {
      throw new TypeError('key resolves outside the storage directory')
    }
    return target
  }

  const readContentType = async (path: string): Promise<string> => {
    try {
      return (await readFile(`${path}${TYPE_SUFFIX}`, 'utf8')).trim() || FALLBACK_CONTENT_TYPE
    }
    catch (error) {
      if (isMissing(error)) return FALLBACK_CONTENT_TYPE
      throw error
    }
  }

  /** Every file under `root`, keyed the way the object store would key it. */
  const walk = async (directory: string, keys: string[]): Promise<void> => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    }
    catch (error) {
      if (isMissing(error)) return
      throw error
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path, keys)
      else if (!entry.name.endsWith(TYPE_SUFFIX)) keys.push(relative(root, path).split(sep).join('/'))
    }
  }

  const driver: EponymeStorageDriver = {
    async put(key, data, meta) {
      const path = pathFor(key)
      try {
        await mkdir(dirname(path), { recursive: true })
        const body = data instanceof Uint8Array
          ? Buffer.from(data)
          : Readable.fromWeb(data as Parameters<typeof Readable.fromWeb>[0])
        await writeFile(path, body)
        await writeFile(`${path}${TYPE_SUFFIX}`, meta.contentType, 'utf8')
      }
      catch (error) {
        // The boot warning only fires when NODE_ENV says production, and a preview deployment or a
        // container with the wrong ownership will not have said it.
        if (isReadOnly(error)) throw readOnlyError(root)
        throw error
      }
    },

    async get(key) {
      const path = pathFor(key)
      await stat(path)
      return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>
    },

    async delete(key) {
      const path = pathFor(key)
      await rm(path, { force: true })
      await rm(`${path}${TYPE_SUFFIX}`, { force: true })
    },

    async stat(key) {
      const path = pathFor(key)
      try {
        const stats = await stat(path)
        return { contentType: await readContentType(path), size: stats.size }
      }
      catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },

    async list(prefix = '', listOptions: EponymeStorageListOptions = {}): Promise<EponymeStorageListResult> {
      validatePrefix(prefix)
      const keys: string[] = []
      await walk(root, keys)
      keys.sort()

      const matching = keys.filter(key => key.startsWith(prefix))
      const prefixes = new Set<string>()
      const objects: EponymeStorageObject[] = []

      for (const key of matching) {
        if (listOptions.delimiter) {
          const index = key.indexOf(listOptions.delimiter, prefix.length)
          if (index !== -1) {
            prefixes.add(key.slice(0, index + listOptions.delimiter.length))
            continue
          }
        }
        const stats = await stat(pathFor(key)).catch(() => null)
        if (stats) objects.push({ key, size: stats.size, lastModified: stats.mtime })
      }

      // Paginated after the fact rather than during the walk: a `cursor` has to mean the same position
      // whatever the caller asked for, and the delimiter decides what a position is.
      const start = listOptions.cursor ? objects.findIndex(object => object.key === listOptions.cursor) : 0
      const from = start === -1 ? objects.length : start
      const limit = listOptions.limit ?? objects.length
      const page = objects.slice(from, from + limit)
      const next = objects[from + limit]

      return { objects: page, prefixes: [...prefixes], cursor: next?.key }
    },

    async move(from, to, meta) {
      const source = pathFor(from)
      const target = pathFor(to)
      if (source === target) throw new TypeError('move source and destination must be different')
      try {
        await mkdir(dirname(target), { recursive: true })
        await rename(source, target)
        await rm(`${source}${TYPE_SUFFIX}`, { force: true })
        await writeFile(`${target}${TYPE_SUFFIX}`, meta.contentType, 'utf8')
      }
      catch (error) {
        if (isReadOnly(error)) throw readOnlyError(root)
        throw error
      }
    },

    async url(key) {
      return `${publicUrl}/${validateKey(key).split('/').map(encodeURIComponent).join('/')}`
    },
  }

  // No `presignPut`: there is no third party to sign a request for.
  return () => driver
}

export type { EponymeStorageDriver, EponymeStorageFactory } from '../../types/storage'
