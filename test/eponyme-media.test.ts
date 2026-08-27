import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  assertEponymeMediaKey,
  assertEponymeUpload,
  buildEponymeMediaKey,
  eponymePublicUrl,
  eponymeRawUrl,
  formatBytes,
  guessContentType,
  toEponymeMediaItems,
} from '../src/runtime/server/utils/eponyme-media'
import { local } from '../src/runtime/server/utils/local-storage'
import type { EponymeStorageDriver } from '../src/runtime/types/storage'

const settings = { prefix: 'uploads', maxSize: 1024, accept: ['image/*', 'application/pdf'] }

function status(action: () => unknown): number | undefined {
  try {
    action()
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
  return undefined
}

describe('media keys', () => {
  it.each([
    '',
    '/absolute',
    'uploads/../secret',
    'uploads/./file.png',
    'uploads\\file.png',
    'other/file.png',
    'uploads',
  ])('refuses %j', (key) => {
    expect(status(() => assertEponymeMediaKey(key, settings))).toBe(400)
  })

  it('accepts a key inside the configured prefix', () => {
    expect(assertEponymeMediaKey('uploads/2026/08/cover-a1b2c3.png', settings))
      .toBe('uploads/2026/08/cover-a1b2c3.png')
  })

  it('builds a dated, slugified, collision-proof key', () => {
    const key = buildEponymeMediaKey('Café Été – Rapport final.PDF', settings)
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/cafe-ete-rapport-final-[a-z0-9]{6}\.pdf$/)
    expect(buildEponymeMediaKey('photo.jpg', settings)).not.toBe(buildEponymeMediaKey('photo.jpg', settings))
  })

  it('keeps a path from the client out of the key', () => {
    expect(buildEponymeMediaKey('../../etc/passwd', settings)).toMatch(/^uploads\/\d{4}\/\d{2}\/passwd-[a-z0-9]{6}$/)
  })

  it('names a type from the extension without asking the provider', () => {
    expect(guessContentType('uploads/a/b.webp')).toBe('image/webp')
    expect(guessContentType('uploads/a/b.unknown')).toBe('application/octet-stream')
  })

  it('formats sizes the way the interface shows them', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })
})

describe('the address saved into an entry', () => {
  const object = { key: 'uploads/2026/08/cover-a1b2c3.png', size: 4, lastModified: new Date('2026-08-14T10:00:00Z') }
  const driver = (address: string) => ({ url: async () => address }) as unknown as EponymeStorageDriver

  it('keeps a public origin as it is', async () => {
    await expect(eponymePublicUrl(driver('https://cdn.example.com/uploads/cover.png'), object.key))
      .resolves.toBe('https://cdn.example.com/uploads/cover.png')
  })

  it.each([
    'https://bucket.r2.cloudflarestorage.com/uploads/cover.png?X-Amz-Expires=900&X-Amz-Signature=abc',
    'https://storage.googleapis.com/media/uploads/cover.png?X-Goog-Signature=abc',
  ])('replaces a presigned address that would expire: %s', async (address) => {
    // Fifteen minutes is not a lifetime an entry can be published with.
    await expect(eponymePublicUrl(driver(address), object.key))
      .resolves.toBe('/api/eponyme-media/raw/uploads/2026/08/cover-a1b2c3.png')
  })

  it('escapes each segment of the fallback address without escaping the separators', () => {
    expect(eponymeRawUrl('uploads/2026/café & thé.png'))
      .toBe('/api/eponyme-media/raw/uploads/2026/caf%C3%A9%20%26%20th%C3%A9.png')
  })

  it('carries the stable address through to the library item', async () => {
    const [item] = await toEponymeMediaItems(driver('https://bucket.example.com/a.png?X-Amz-Signature=abc'), [object])
    expect(item!.url).toBe('/api/eponyme-media/raw/uploads/2026/08/cover-a1b2c3.png')
    expect(item!.contentType).toBe('image/png')
    expect(item!.lastModified).toBe('2026-08-14T10:00:00.000Z')
  })

  it('decides once per page whether addresses expire, not once per object', async () => {
    let signings = 0
    const counting = {
      url: async (key: string) => {
        signings++
        return `https://bucket.example.com/${key}?X-Amz-Signature=abc`
      },
    } as unknown as EponymeStorageDriver
    const objects = Array.from({ length: 60 }, (_, index) => ({ ...object, key: `uploads/${index}.png` }))

    const items = await toEponymeMediaItems(counting, objects)

    expect(items).toHaveLength(60)
    // Sixty signed URLs would have been built only to be thrown away.
    expect(signings).toBe(1)
  })

  it('has nothing to decide for an empty page', async () => {
    await expect(toEponymeMediaItems(driver('https://cdn.example.com/a.png'), [])).resolves.toEqual([])
  })
})

describe('upload limits', () => {
  it('accepts what the configuration allows', () => {
    expect(() => assertEponymeUpload('image/png', 512, settings)).not.toThrow()
  })

  it.each([
    ['image/png\r\nX-Test: bad', 10, 400],
    ['not-a-type', 10, 400],
    ['image/png', 0, 400],
    ['image/png', 1.5, 400],
    ['image/png', 2048, 413],
    ['text/html', 10, 415],
  ])('refuses %j at %s bytes with %s', (contentType, size, expected) => {
    expect(status(() => assertEponymeUpload(contentType, size, settings))).toBe(expected)
  })

  it('accepts anything when no list is configured', () => {
    expect(() => assertEponymeUpload('text/html', 10, { ...settings, accept: [] })).not.toThrow()
  })
})

describe('local storage driver', () => {
  let directory: string
  let driver: EponymeStorageDriver

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eponyme-storage-'))
    driver = await local({ dir: directory })({})
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('round-trips content and its type', async () => {
    await driver.put('uploads/note.txt', new TextEncoder().encode('hello'), {
      contentType: 'text/plain',
      size: 5,
    })

    expect(await driver.stat('uploads/note.txt')).toEqual({ contentType: 'text/plain', size: 5 })
    expect(await new Response(await driver.get('uploads/note.txt')).text()).toBe('hello')
    expect(await driver.url('uploads/note.txt')).toBe('/api/eponyme-media/raw/uploads/note.txt')
  })

  it('reports a missing object as null rather than as a failure', async () => {
    expect(await driver.stat('uploads/absent.txt')).toBeNull()
    await expect(driver.delete('uploads/absent.txt')).resolves.toBeUndefined()
  })

  it('refuses a key that would escape the directory', async () => {
    await expect(driver.stat('../escape.txt')).rejects.toThrow('invalid path segment')
    await expect(driver.put('/absolute.txt', new Uint8Array(), { contentType: 'text/plain', size: 0 }))
      .rejects.toThrow('key must be relative')
  })

  it('lists what it stored, and hides the type sidecars', async () => {
    await driver.put('uploads/a.png', new Uint8Array([1]), { contentType: 'image/png', size: 1 })
    await driver.put('uploads/nested/b.png', new Uint8Array([2]), { contentType: 'image/png', size: 1 })

    const listed = await driver.list('uploads/')
    expect(listed.objects.map(object => object.key)).toEqual([
      'uploads/a.png',
      'uploads/nested/b.png',
      'uploads/note.txt',
    ])
    expect(listed.cursor).toBeUndefined()

    const folders = await driver.list('uploads/', { delimiter: '/' })
    expect(folders.prefixes).toEqual(['uploads/nested/'])
    expect(folders.objects.map(object => object.key)).toEqual(['uploads/a.png', 'uploads/note.txt'])
  })

  it('pages with a cursor that names the next key', async () => {
    const first = await driver.list('uploads/', { limit: 2 })
    expect(first.objects).toHaveLength(2)
    expect(first.cursor).toBe('uploads/note.txt')

    const second = await driver.list('uploads/', { limit: 2, cursor: first.cursor })
    expect(second.objects.map(object => object.key)).toEqual(['uploads/note.txt'])
    expect(second.cursor).toBeUndefined()
  })

  it('moves the content and its type together', async () => {
    await driver.move('uploads/a.png', 'uploads/moved.webp', { contentType: 'image/webp', size: 1 })
    expect(await driver.stat('uploads/a.png')).toBeNull()
    expect(await driver.stat('uploads/moved.webp')).toEqual({ contentType: 'image/webp', size: 1 })
  })

  it('deletes the sidecar with the object', async () => {
    await driver.delete('uploads/moved.webp')
    await expect(readFile(join(directory, 'uploads/moved.webp.eponyme-type'))).rejects.toThrow()
  })

  it('has no presignPut, which is what routes uploads through the application', () => {
    expect(driver.presignPut).toBeUndefined()
  })

  // What a serverless host does to every write. The errno alone says `EROFS` and nothing about
  // the cause, so the driver replaces it with a sentence and a `code` the route can match.
  // Tested against a directory the process genuinely cannot write to, rather than a mocked
  // `fs` – the point is that a real refusal is recognised, whichever errno it arrives as.
  it.skipIf(process.getuid?.() === 0)('explains a read-only filesystem instead of surfacing the errno', async () => {
    const locked = join(directory, 'locked')
    await mkdir(locked)
    await chmod(locked, 0o500)

    try {
      const readOnly = await local({ dir: locked })({})
      const error = await readOnly
        .put('uploads/a.txt', new Uint8Array([1]), { contentType: 'text/plain', size: 1 })
        .then(() => undefined, (cause: Error) => cause)

      expect(error).toBeInstanceOf(Error)
      expect((error as { code?: string }).code).toBe('read_only')
      expect(error!.message).toContain('the filesystem is read-only')
      expect(error!.message).toContain('eponyme.storage.ts')
    }
    finally {
      await chmod(locked, 0o700)
    }
  })

  it('warns at boot when it is the driver of a production deployment', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      local({ dir: directory })
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]![0]).toContain('another instance cannot read them back')
    }
    finally {
      process.env.NODE_ENV = previous
      warn.mockRestore()
    }
  })
})
