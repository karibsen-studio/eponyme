import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { setup, url } from '@nuxt/test-utils/e2e'

/**
 * The same fixture as the main suite, with `storage.private` on: a private deployment must not serve an
 * object to whoever holds its address, and must not let a cache keep a copy.
 */
describe('private media', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
    nuxtConfig: {
      eponyme: {
        prismaClient: './server/utils/prisma',
        storage: { driver: './eponyme.private-storage.ts', private: true },
      },
    },
  })

  const origin = () => new URL(url('/')).origin

  afterAll(async () => {
    await rm('.eponyme/test-private-media', { recursive: true, force: true })
  })

  it('asks for a session on the read route and keeps the answer out of caches', async () => {
    const login = await fetch(url('/api/eponyme-auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'EponymeOwner', password: 'InitialPassword123!' }),
    })
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
    expect(cookie).not.toBe('')

    const ticket = await (await fetch(url('/api/eponyme-media/upload'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'origin': origin() },
      body: JSON.stringify({ name: 'confidential.txt', contentType: 'text/plain', size: 6 }),
    })).json()

    // Even a driver with an address of its own is published through the route that checks the session.
    expect(ticket.publicUrl).toBe(`/api/eponyme-media/raw/${ticket.key.split('/').map(encodeURIComponent).join('/')}`)

    const uploaded = await fetch(url(ticket.url), {
      method: 'PUT',
      headers: { 'content-type': 'text/plain', cookie, 'origin': origin() },
      body: 'secret',
    })
    expect(uploaded.status).toBe(200)

    // The address alone is not an access control.
    expect((await fetch(url(ticket.publicUrl))).status).toBe(401)

    const read = await fetch(url(ticket.publicUrl), { headers: { cookie } })
    expect(read.status).toBe(200)
    expect(await read.text()).toBe('secret')
    expect(read.headers.get('cache-control')).toBe('private, no-store')

    // A session is not enough either: the read asks for `media.read`, like the library itself.
    const created = await (await fetch(url('/api/eponyme-users'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'origin': origin() },
      body: JSON.stringify({ username: 'PrivateMediaOutsider', role: 'contributor' }),
    })).json()
    const outsiderLogin = await fetch(url('/api/eponyme-auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'PrivateMediaOutsider', password: created.temporaryPassword }),
    })
    const outsider = outsiderLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
    expect((await fetch(url(ticket.publicUrl), { headers: { cookie: outsider } })).status).toBe(403)
  })
})
