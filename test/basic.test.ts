import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { setup, $fetch, url } from '@nuxt/test-utils/e2e'
import { EPONYME_DATE_LOCALE } from '../src/runtime/utils/date-locale'
import type { EponymeExportFile } from '../src/runtime/server/services/eponyme-store'
import type { EponymeAuditPage } from '../src/runtime/types/audit'
import type { EponymePermissionRule } from '../src/runtime/types/permissions'
import { canEponyme } from '../src/runtime/utils/eponyme-permissions'

function buttonLabels(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1]!
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
}

function buttonMarkup(html: string, label: string): string | undefined {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find((match) => {
    const text = match[0]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;|&#160;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text === label
  })?.[0]
}

describe('ssr', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })
  let authCookie = ''
  const authenticated = () => ({ headers: { cookie: authCookie } })
  // Trashing, untrashing and restoring a version lock on the version the caller last read,
  // so each helper fetches it first rather than writing blind.
  const revised = (revision: string) => ({ headers: { 'cookie': authCookie, 'x-eponyme-revision': revision } })
  const draftRevision = async (name: string) => {
    const entry = await $fetch<{ revision: string | null }>(`/api/eponyme/${name}?version=draft`, authenticated())
    return entry.revision ?? ''
  }
  const trashedRevision = async (collection: string, slug: string) => {
    const { entries } = await $fetch<{ entries: Array<{ slug: string, updatedAt: string | null }> }>(`/api/eponyme-trash/${collection}`, authenticated())
    return entries.find(entry => entry.slug === slug)?.updatedAt ?? ''
  }
  const trashEntry = async (name: string) =>
    await $fetch(`/api/eponyme-collections/${name}`, { method: 'DELETE', ...revised(await draftRevision(name)) })
  const untrashEntry = async (collection: string, slug: string) =>
    await $fetch(`/api/eponyme-trash/${collection}/${slug}`, { method: 'PATCH', ...revised(await trashedRevision(collection, slug)) })
  // Deleting only moves an entry to the trash, where it keeps its slug. Tests share
  // one database and reuse slugs, so cleanup has to purge as well.
  const removeArticle = async (slug: string) => {
    await trashEntry(`articles/${slug}`)
    await $fetch(`/api/eponyme-trash/articles/${slug}`, { method: 'DELETE', ...authenticated() })
  }
  const saveAndPublish = async (name: string, data: Record<string, unknown>) => {
    await $fetch(`/api/eponyme/${name}?action=draft`, {
      method: 'PATCH',
      body: data,
      ...authenticated(),
    })
    return await $fetch(`/api/eponyme/${name}?action=publish`, {
      method: 'PATCH',
      body: {},
      ...authenticated(),
    })
  }

  beforeAll(async () => {
    const response = await fetch(url('/api/eponyme-auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'EponymeOwner', password: 'InitialPassword123!' }),
    })
    authCookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  })

  it('renders the index page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })

  it('renders the generated dashboard index', async () => {
    const html = await $fetch('/__eponyme', authenticated())
    expect(html).toContain('Content entries')
    expect(html).toContain('Homepage')
    expect(html).toContain('href="/__eponyme/pages"')
    // Transferring content between environments is only offered from this overview.
    expect(html).toContain('Export')
    expect(html).toContain('Import')
  })

  it('keeps the host layout out of the dashboard', async () => {
    // The public page is wrapped by the application's default layout…
    const publicHtml = String(await $fetch('/'))
    expect(publicHtml).toContain('host-header')
    expect(publicHtml).toContain('host-footer')

    // …while the dashboard pages opt out of it entirely.
    for (const path of ['/__eponyme', '/__eponyme/login', '/__eponyme/pages/homepage']) {
      const html = String(await $fetch(path, authenticated()))
      expect(html, path).not.toContain('host-header')
      expect(html, path).not.toContain('host-footer')
    }
  })

  it('restores the Eponyme theme from its cookie on the html element', async () => {
    for (const theme of ['light', 'dark']) {
      const html = String(await $fetch('/__eponyme/login', {
        headers: { cookie: `eponyme-theme=${theme}` },
      }))
      expect(html).toMatch(new RegExp(`<html[^>]*class="[^"]*ep-${theme}[^"]*"`))
    }

    const firstVisitHtml = String(await $fetch('/__eponyme/login'))
    expect(firstVisitHtml).toContain('eponyme-theme')
    expect(firstVisitHtml).toContain('prefers-color-scheme: light')

    const publicHtml = String(await $fetch('/', {
      headers: { cookie: 'eponyme-theme=light' },
    }))
    expect(publicHtml).not.toMatch(/<html[^>]*class="[^"]*ep-(?:light|dark)[^"]*"/)
  })

  it('keeps translated server errors in the JSON response body', async () => {
    const response = await fetch(url('/api/eponyme-auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'EponymeOwner', password: 'wrong-password' }),
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toMatchObject({
      statusCode: 401,
      message: 'Invalid username or password.',
    })
  })

  it('exposes and updates Eponyme data', async () => {
    await expect($fetch('/api/eponyme-statuses', authenticated())).resolves.toEqual({
      // Every configured singleton is listed; one with no row yet reads as published.
      statuses: { 'pages/frozen': 'published', 'pages/homepage': 'published' },
    })

    await expect($fetch('/api/eponyme/pages/homepage')).resolves.toEqual({
      data: { title: 'Welcome', rating: 3, maxGuests: 10, enabled: true, tags: ['nuxt'], meta: { description: 'Homepage description' } },
    })

    await expect($fetch('/api/eponyme/pages/homepage', {
      method: 'PATCH',
      body: { maxGuests: 12 },
      ...authenticated(),
    })).resolves.toEqual({
      data: { title: 'Welcome', rating: 3, maxGuests: 12, enabled: true, tags: ['nuxt'], meta: { description: 'Homepage description' } },
    })

    await $fetch('/api/eponyme/pages/homepage?action=draft', {
      method: 'PATCH',
      body: { maxGuests: 14 },
      ...authenticated(),
    })
    await expect($fetch('/api/eponyme-statuses', authenticated())).resolves.toEqual({
      // Every configured singleton is listed; one with no row yet reads as published.
      statuses: { 'pages/frozen': 'published', 'pages/homepage': 'published' },
    })
  })

  it('rejects invalid Eponyme data', async () => {
    const response = await $fetch('/api/eponyme/pages/homepage', {
      method: 'PATCH',
      body: { maxGuests: 100, rating: 8, unknown: true },
      ignoreResponseError: true,
      ...authenticated(),
    })
    expect(response).toEqual({
      errors: {
        maxGuests: ['Must be at most 20.'],
        rating: ['Must be an integer from 1 to 5.'],
        unknown: ['Unknown field.'],
      },
    })
  })

  it('normalizes and validates a custom field through the generated Nitro registry', async () => {
    await expect($fetch('/api/eponyme/pages/homepage', {
      method: 'PATCH',
      body: { rating: '5' },
      ...authenticated(),
    })).resolves.toMatchObject({ data: { rating: 5 } })

    await expect($fetch('/api/eponyme/pages/homepage', {
      method: 'PATCH',
      body: { rating: 3 },
      ...authenticated(),
    })).resolves.toMatchObject({ data: { rating: 3 } })
  })

  it('resolves content variables for the public API but not for the editor', async () => {
    const year = new Date().getFullYear()
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Variables' }, ...authenticated() })
    await saveAndPublish('articles/variables', {
      title: 'Variables',
      slug: 'variables',
      excerpt: 'Saison {{ season }} au {{ clubName }}, en {{ currentYear }}.',
    })

    const published = await $fetch<{ data: { excerpt: string } }>('/api/eponyme/articles/variables')
    expect(published.data.excerpt).toBe(`Saison ${year}-${year + 1} au Test Club, en ${year}.`)

    // The dashboard asks for the source text, so the variable stays editable.
    const raw = await $fetch<{ data: { excerpt: string } }>('/api/eponyme/articles/variables?version=draft&raw=1', authenticated())
    expect(raw.data.excerpt).toContain('{{ season }}')

    // Collections go through the same interpolation.
    const listed = await $fetch<{ entries: Array<{ data: { excerpt: string } }> }>('/api/eponyme-collections/articles')
    expect(listed.entries[0]!.data.excerpt).toContain(`en ${year}.`)

    await removeArticle('variables')
  })

  it('never evaluates an expression found in content', async () => {
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Injection' }, ...authenticated() })
    const excerpt = 'Value {{ new Date().getFullYear() }} and {{ unknownName }}.'
    await saveAndPublish('articles/injection', { title: 'Injection', slug: 'injection', excerpt })

    // Expressions and unknown names are left verbatim rather than executed or blanked.
    const published = await $fetch<{ data: { excerpt: string } }>('/api/eponyme/articles/injection')
    expect(published.data.excerpt).toBe(excerpt)

    await removeArticle('injection')
  })

  it('emits hooks around saves, publications and submissions', async () => {
    await $fetch('/api/eponyme/pages/homepage?action=draft', {
      method: 'PATCH',
      body: { title: 'Hooked' },
      ...authenticated(),
    })
    await $fetch('/api/eponyme/pages/homepage?action=publish', {
      method: 'PATCH',
      body: {},
      ...authenticated(),
    })
    await $fetch('/api/eponyme/pages/homepage?action=schedule', {
      method: 'PATCH',
      body: {
        scheduledUnpublishAt: '2099-01-01T00:00:00.000Z',
      },
      ...authenticated(),
    })
    await $fetch('/api/eponyme/pages/homepage?action=unschedule', {
      method: 'PATCH',
      body: {},
      ...authenticated(),
    })
    await $fetch('/api/eponyme/pages/homepage?action=unpublish', {
      method: 'PATCH',
      body: {},
      ...authenticated(),
    })
    await expect($fetch('/api/eponyme/pages/homepage')).rejects.toMatchObject({ status: 404 })
    await $fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Ada', email: 'ada@example.com', message: 'Hook me up.' },
    })

    const { seen } = await $fetch<{ seen: string[] }>('/_hooks')
    // A listener throwing on `saved` must not have failed the save itself.
    expect(seen).toContain('saved:pages/homepage')
    expect(seen).toContain('published:pages/homepage:-')
    expect(seen).toContain('scheduled:pages/homepage')
    expect(seen).toContain('unscheduled:pages/homepage')
    expect(seen).toContain('unpublished:pages/homepage')
    expect(seen).toContain('submitted:contact:true')

    // Later tests share this fixture's database, so put it back as it was.
    await $fetch('/api/eponyme-forms/contact/submissions', { method: 'DELETE', ...authenticated() })
    await $fetch('/api/eponyme/pages/homepage?action=publish', {
      method: 'PATCH',
      body: {},
      ...authenticated(),
    })
  })

  it('lets a blocking hook reject or amend a write', async () => {
    await expect($fetch('/api/eponyme/pages/homepage?action=draft', {
      method: 'PATCH',
      body: { title: 'reject-me' },
      ...authenticated(),
    })).rejects.toMatchObject({ status: 422 })

    await $fetch('/api/eponyme/pages/homepage?action=draft', {
      method: 'PATCH',
      body: { title: 'amend-me' },
      ...authenticated(),
    })
    // The hook rewrote the payload before it reached the database.
    await expect($fetch('/api/eponyme/pages/homepage?version=draft&raw=1', authenticated()))
      .resolves.toMatchObject({ data: { title: 'amended by hook' } })

    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Ada', email: 'blocked@example.com', message: 'Should not pass.' },
    })).rejects.toMatchObject({ status: 422 })

    await saveAndPublish('pages/homepage', { title: 'Welcome' })
  })

  it('renders a nested Eponyme dashboard page', async () => {
    const html = String(await $fetch('/__eponyme/pages/homepage', authenticated()))
    expect(html).toContain('homepage')
    expect(html).toContain('href="/__eponyme/pages/homepage"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    const activeLink = html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]
    expect(activeLink).toContain('href="/__eponyme/pages/homepage"')
    expect(html).toContain('Custom rating')
    expect(html).toContain('Welcome')
    expect(html).toContain('Add item')
    expect(html).toContain('Metadata')
    expect(html).toContain('aria-label="Entry sections"')
    expect(html).toContain('Publication')
    expect(html).toContain('Save')
    expect(html).toContain('Revert to draft')
    expect(html).toContain('Unpublish')
    expect(html).toContain('Schedule')
    expect(html).not.toContain('Loading…')
  })

  it('exposes the general sitemap metadata', async () => {
    await $fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Sitemap article' },
      ...authenticated(),
    })
    await expect($fetch<{ entries: Array<{ loc: string }> }>('/api/eponyme-sitemap').then(result => result.entries.map(entry => entry.loc))).resolves.toEqual(['/'])

    await saveAndPublish('articles/sitemap-article', {
      title: 'Sitemap article',
      slug: 'sitemap-article',
      excerpt: 'Listed publicly.',
    })
    await expect($fetch('/api/eponyme-sitemap')).resolves.toMatchObject({
      entries: [
        { loc: '/' },
        { loc: '/articles/sitemap-article', lastmod: expect.any(String) },
      ],
    })
    // The auto-imported server utility must produce exactly the same list.
    await expect($fetch('/sitemap-util')).resolves.toEqual(await $fetch('/api/eponyme-sitemap'))

    await removeArticle('sitemap-article')
    await expect($fetch<{ entries: Array<{ loc: string }> }>('/api/eponyme-sitemap').then(result => result.entries.map(entry => entry.loc))).resolves.toEqual(['/'])
  })

  it('creates and publishes collection entries', async () => {
    const created = await $fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'First article' },
      ...authenticated(),
    })
    expect(created).toMatchObject({ slug: 'first-article', status: 'draft' })
    await expect($fetch('/api/eponyme-collections/articles')).resolves.toEqual({ entries: [], total: 0 })

    await expect($fetch('/api/eponyme/articles/first-article?action=publish', {
      method: 'PATCH',
      body: { excerpt: 'This must be saved first.' },
      ...authenticated(),
    })).rejects.toMatchObject({ status: 400 })

    await saveAndPublish('articles/first-article', {
      title: 'First article',
      slug: 'first-article',
      excerpt: 'A public article.',
    })
    await expect($fetch('/api/eponyme-collections/articles')).resolves.toMatchObject({
      entries: [{ slug: 'first-article', title: 'First article', data: { excerpt: 'A public article.' } }],
    })
    const html = String(await $fetch('/__eponyme/articles/first-article', authenticated()))
    expect(html).toContain('First article')
    // The rich text field is loaded lazily, and Vue awaits an async component before rendering,
    // so its label must still reach the server-rendered HTML rather than a loading placeholder.
    expect(html).toContain('Body')

    await expect(trashEntry('articles/first-article')).resolves.toEqual({ deleted: true })
    await $fetch('/api/eponyme-trash/articles/first-article', { method: 'DELETE', ...authenticated() })
  })

  it('lists a collection page by page, and without the payloads when asked for metadata', async () => {
    const slugs = ['meta-one', 'meta-two', 'meta-three']
    for (const slug of slugs) {
      await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: slug }, ...authenticated() })
      await saveAndPublish(`articles/${slug}`, { title: slug, slug, excerpt: 'An excerpt nobody asked for.' })
    }

    type Page = { entries: Array<{ slug: string, title: string, data?: unknown }>, total: number }
    const first = await $fetch<Page>('/api/eponyme-collections/articles?fields=meta&take=2')
    // `total` counts the collection, not the page, which is what a pager needs.
    expect(first.total).toBe(3)
    expect(first.entries).toHaveLength(2)
    expect(first.entries.every(entry => entry.data === undefined)).toBe(true)
    expect(first.entries.every(entry => entry.title.startsWith('meta-'))).toBe(true)

    const second = await $fetch<Page>('/api/eponyme-collections/articles?fields=meta&take=2&skip=2')
    expect(second.entries).toHaveLength(1)
    expect(new Set([...first.entries, ...second.entries].map(entry => entry.slug)).size).toBe(3)

    // A search narrows the count as well as the page, otherwise the pager would offer
    // pages the search cannot fill.
    const found = await $fetch<Page>('/api/eponyme-collections/articles?fields=meta&search=meta-two')
    expect(found.total).toBe(1)
    expect(found.entries[0]).toMatchObject({ slug: 'meta-two' })

    // Without the flag the payload is still there: the public composable reads it.
    const full = await $fetch<Page>('/api/eponyme-collections/articles?take=1')
    expect(full.entries[0]!.data).toMatchObject({ excerpt: 'An excerpt nobody asked for.' })

    for (const slug of slugs) await removeArticle(slug)
  })

  it('trashes, restores and purges a collection entry over HTTP', async () => {
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Trashed article' }, ...authenticated() })
    await saveAndPublish('articles/trashed-article', {
      title: 'Trashed article',
      slug: 'trashed-article',
      excerpt: 'Soon in the trash.',
    })

    await expect(trashEntry('articles/trashed-article')).resolves.toEqual({ deleted: true })
    // Gone from every read, including the public ones.
    await expect($fetch('/api/eponyme-collections/articles')).resolves.toEqual({ entries: [], total: 0 })
    await expect($fetch('/api/eponyme/articles/trashed-article')).rejects.toMatchObject({ status: 404 })
    await expect($fetch<{ entries: Array<{ loc: string }> }>('/api/eponyme-sitemap').then(result => result.entries.map(entry => entry.loc))).resolves.toEqual(['/'])
    await expect($fetch<{ entries: Array<{ slug: string }> }>('/api/eponyme-trash/articles', authenticated()))
      .resolves.toMatchObject({ entries: [{ slug: 'trashed-article' }], total: 1 })
    // The trash is never public.
    await expect($fetch('/api/eponyme-trash/articles')).rejects.toMatchObject({ status: 401 })
    // And the slug it holds cannot be taken back by a new entry.
    await expect($fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Retake', slug: 'trashed-article' },
      ignoreResponseError: true,
      ...authenticated(),
    })).resolves.toMatchObject({ errors: { slug: [expect.stringContaining('trash')] } })

    await expect(untrashEntry('articles', 'trashed-article')).resolves.toEqual({ restored: true })
    await expect($fetch('/api/eponyme-collections/articles')).resolves.toMatchObject({ entries: [{ slug: 'trashed-article' }] })
    // Restoring kept the history the hard delete used to destroy.
    const { history } = await $fetch<{ history: unknown[] }>('/api/eponyme-history/articles/trashed-article', authenticated())
    expect(history.length).toBeGreaterThan(0)

    await trashEntry('articles/trashed-article')
    await expect($fetch('/api/eponyme-trash/articles/trashed-article', { method: 'DELETE', ...authenticated() })).resolves.toEqual({ purged: true })
    await expect($fetch('/api/eponyme-trash/articles', authenticated())).resolves.toEqual({ entries: [], total: 0 })
    // Purged for good: the slug is free again.
    await expect($fetch('/api/eponyme-trash/articles/trashed-article', { method: 'DELETE', ...authenticated() })).rejects.toMatchObject({ status: 404 })
  })

  it('locks a write on the revision the editor read, over HTTP', async () => {
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Concurrent article' }, ...authenticated() })
    await saveAndPublish('articles/concurrent-article', {
      title: 'Concurrent article',
      slug: 'concurrent-article',
      excerpt: 'Two editors, one entry.',
    })

    // What the editor holds after opening the entry. A public read hands out no token.
    const opened = await $fetch<{ revision: string | null }>('/api/eponyme/articles/concurrent-article?version=draft', authenticated())
    expect(opened.revision).toEqual(expect.any(String))
    await expect($fetch<{ revision: string | null }>('/api/eponyme/articles/concurrent-article?version=published'))
      .resolves.toMatchObject({ revision: null })

    // Someone else saves in the meantime.
    await $fetch('/api/eponyme/articles/concurrent-article?action=draft', {
      method: 'PATCH',
      body: { excerpt: 'Saved by someone else.' },
      ...authenticated(),
    })

    await expect($fetch('/api/eponyme/articles/concurrent-article?action=draft', {
      method: 'PATCH',
      body: { excerpt: 'Saved from a stale tab.' },
      ...revised(opened.revision!),
    })).rejects.toMatchObject({ status: 409 })
    await expect($fetch<{ data: { excerpt: string } }>('/api/eponyme/articles/concurrent-article?version=draft', authenticated()))
      .resolves.toMatchObject({ data: { excerpt: 'Saved by someone else.' } })

    // Trashing and untrashing refuse to run blind rather than defaulting to last write wins.
    await expect($fetch('/api/eponyme-collections/articles/concurrent-article', { method: 'DELETE', ...authenticated() }))
      .rejects.toMatchObject({ status: 428 })
    await expect($fetch('/api/eponyme-collections/articles/concurrent-article', { method: 'DELETE', ...revised(opened.revision!) }))
      .rejects.toMatchObject({ status: 409 })

    await expect(trashEntry('articles/concurrent-article')).resolves.toEqual({ deleted: true })
    await expect($fetch('/api/eponyme-trash/articles/concurrent-article', { method: 'PATCH', ...revised(opened.revision!) }))
      .rejects.toMatchObject({ status: 409 })
    await expect(untrashEntry('articles', 'concurrent-article')).resolves.toEqual({ restored: true })

    await removeArticle('concurrent-article')
  })

  it('filters a collection over HTTP', async () => {
    const write = async (title: string, tags: string[]) => {
      const slug = title.toLowerCase().replace(/ /g, '-')
      await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title }, ...authenticated() })
      await saveAndPublish(`articles/${slug}`, { title, slug, tags })
      return slug
    }
    const slugs = [await write('Filter Nuxt', ['Nuxt']), await write('Filter Vue', ['Vue']), await write('Filter Both', ['Nuxt', 'Vue'])]
    const titles = async (search: string) =>
      (await $fetch<{ entries: Array<{ title: string }> }>(`/api/eponyme-collections/articles?orderBy=title&order=asc&${search}`)).entries.map(entry => entry.title)

    // Case-folded, so the spelling stored first does not decide what a filter finds.
    await expect(titles('where[tags]=NUXT')).resolves.toEqual(['Filter Both', 'Filter Nuxt'])
    // Repeating a key means "any of".
    await expect(titles('where[tags]=nuxt&where[tags]=vue')).resolves.toEqual(['Filter Both', 'Filter Nuxt', 'Filter Vue'])
    await expect(titles('where[tags]=svelte')).resolves.toEqual([])

    // A typo is reported rather than ignored: a filter that quietly does nothing returns
    // the whole collection, which the caller reads as a real answer.
    await expect($fetch('/api/eponyme-collections/articles?where[nope]=x')).rejects.toMatchObject({ status: 400 })
    // `excerpt` is free text, so it is not filterable even though it exists.
    await expect($fetch('/api/eponyme-collections/articles?where[excerpt]=x')).rejects.toMatchObject({ status: 400 })
    await expect($fetch('/api/eponyme-collections/articles?where[tags][like]=x')).rejects.toMatchObject({ status: 400 })

    // `not` excludes, and reaches the entry that carries no tag at all – which has no index
    // row to be found by, so only a subtraction returns it.
    await expect(titles('where[tags][not]=nuxt')).resolves.toEqual(['Filter Vue'])
    await expect(titles('where[tags][in]=vue&where[tags][not]=nuxt')).resolves.toEqual(['Filter Vue'])
    await expect(titles('where[tags][contains]=ux')).resolves.toEqual(['Filter Both', 'Filter Nuxt'])

    for (const slug of slugs) await removeArticle(slug)
  })

  it('sorts, limits and paginates a collection over HTTP', async () => {
    for (const title of ['Sort Charlie', 'Sort Alpha', 'Sort Bravo']) {
      const slug = title.toLowerCase().replace(/ /g, '-')
      await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title }, ...authenticated() })
      await saveAndPublish(`articles/${slug}`, { title, slug, excerpt: `Excerpt for ${title}.` })
    }

    const sorted = await $fetch<{ entries: Array<{ title: string }>, total: number }>(
      '/api/eponyme-collections/articles?orderBy=title&order=asc',
    )
    expect(sorted.entries.map(entry => entry.title)).toEqual(['Sort Alpha', 'Sort Bravo', 'Sort Charlie'])

    const firstPage = await $fetch<{ entries: Array<{ title: string }>, total: number }>(
      '/api/eponyme-collections/articles?orderBy=title&order=asc&take=1',
    )
    expect(firstPage.entries.map(entry => entry.title)).toEqual(['Sort Alpha'])
    // `total` ignores `take`, so a pager can be built from it.
    expect(firstPage.total).toBe(sorted.total)

    const secondPage = await $fetch<{ entries: Array<{ title: string }> }>(
      '/api/eponyme-collections/articles?orderBy=title&order=asc&take=1&skip=1',
    )
    expect(secondPage.entries.map(entry => entry.title)).toEqual(['Sort Bravo'])

    // A typo in the sort key is reported instead of silently returning any order.
    await expect($fetch('/api/eponyme-collections/articles?orderBy=nope')).rejects.toMatchObject({ status: 400 })

    for (const title of ['Sort Charlie', 'Sort Alpha', 'Sort Bravo']) {
      const slug = title.toLowerCase().replace(/ /g, '-')
      await removeArticle(slug)
    }
  })

  it('never renders an unpublished version into the HTML of a public route', async () => {
    await $fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Preview article' },
      ...authenticated(),
    })
    const previewQuery = '__eponyme_preview=articles%2Fpreview-article&__eponyme_preview_version'

    // An unpublished entry stays invisible on its public route, preview or not.
    expect(String(await $fetch('/articles/preview-article'))).toContain('article-not-available')

    await saveAndPublish('articles/preview-article', {
      title: 'Preview article',
      slug: 'preview-article',
      excerpt: 'First excerpt.',
    })
    await $fetch('/api/eponyme/articles/preview-article?action=draft', {
      method: 'PATCH',
      body: { title: 'Preview article', slug: 'preview-article', excerpt: 'Unpublished excerpt.' },
      ...authenticated(),
    })

    // The public route is server-rendered as usual: that HTML is safe to cache.
    expect(String(await $fetch('/articles/preview-article'))).toContain('First excerpt.')

    // A draft preview is not. Even with a valid session, the draft never reaches the HTML:
    // a page route may be cached by nitro, a CDN or ISR, and a cache does not re-check the
    // session before replaying what it stored. The panel fetches the draft from the browser.
    const draftHtml = String(await $fetch(`/articles/preview-article?${previewQuery}=draft`, authenticated()))
    expect(draftHtml).not.toContain('Unpublished excerpt.')
    // The draft is still reachable, through an authenticated read that carries `no-store`.
    await expect($fetch<{ data: { excerpt: string } }>(
      '/api/eponyme/articles/preview-article?version=draft',
      authenticated(),
    )).resolves.toMatchObject({ data: { excerpt: 'Unpublished excerpt.' } })

    // A historical version is unreleased material too.
    const { history } = await $fetch<{ history: Array<{ id: number, action: string }> }>('/api/eponyme-history/articles/preview-article', authenticated())
    const published = history.find(version => version.action === 'publish')!
    const historyHtml = String(await $fetch(`/articles/preview-article?${previewQuery}=${published.id}`, authenticated()))
    expect(historyHtml).not.toContain('First excerpt.')

    // Previewing the published version is the one case that may be rendered: it is public.
    expect(String(await $fetch(`/articles/preview-article?${previewQuery}=published`, authenticated()))).toContain('First excerpt.')

    await removeArticle('preview-article')
  })

  it('tags the public routes that render an entry, so a purge drops the HTML too', async () => {
    // The fixture declares `previewPaths: { 'pages/homepage': '/', articles: '/articles/:slug' }`.
    const singleton = await fetch(url('/'))
    expect(singleton.headers.get('cache-tag')).toBe('eponyme,eponyme:pages/homepage')
    expect(singleton.headers.get('vercel-cache-tag')).toBe('eponyme,eponyme:pages/homepage')

    // A collection page cannot name a slug in a route rule, so it carries the collection tag,
    // which is one of the tags `getEponymeCacheTags` returns for any entry of that collection.
    const entry = await fetch(url('/articles/whatever'))
    expect(entry.headers.get('cache-tag')).toBe('eponyme,eponyme:articles')

    // The same tag the API response carries, so one purge invalidates both.
    const api = await fetch(url('/api/eponyme-collections/articles'))
    expect(api.headers.get('cache-tag')).toBe('eponyme,eponyme:articles')
  })

  it('keeps a preview response out of every cache', async () => {
    const response = await fetch(url('/articles/anything?__eponyme_preview=articles%2Fanything&__eponyme_preview_version=draft'))
    expect(response.headers.get('cache-control')).toBe('no-store')

    // The same route without the preview query keeps whatever the application decided.
    const public_ = await fetch(url('/articles/anything'))
    expect(public_.headers.get('cache-control')).not.toBe('no-store')
  })

  it('accepts, validates and stores managed form submissions', async () => {
    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Ada', email: 'ada@example.com', message: 'Hello there.' },
    })).resolves.toMatchObject({ submitted: true })

    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'A', email: 'not-an-email', message: '' },
    })).rejects.toMatchObject({
      status: 422,
      data: { errors: { email: expect.any(Array), message: expect.any(Array), name: expect.any(Array) } },
    })

    // Unknown fields are refused rather than silently stored.
    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Ada', email: 'ada@example.com', message: 'Hi.', role: 'admin' },
    })).rejects.toMatchObject({ status: 422, data: { errors: { role: ['Unknown field.'] } } })

    const listed = await $fetch<{ submissions: Array<{ data: { name: string } }>, total: number }>(
      '/api/eponyme-forms/contact/submissions',
      authenticated(),
    )
    expect(listed.total).toBe(1)
    expect(listed.submissions[0]!.data).toMatchObject({ name: 'Ada', email: 'ada@example.com' })
  })

  it('refuses a reference to an entry that does not exist', async () => {
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Referring' }, ...authenticated() })

    await expect($fetch('/api/eponyme/articles/referring', {
      method: 'PATCH',
      body: { related: ['not-an-article'] },
      ...authenticated(),
    })).rejects.toMatchObject({
      status: 422,
      data: { errors: { related: ['Points at an entry that does not exist: not-an-article.'] } },
    })

    await trashEntry('articles/referring')
  })

  it('refuses to trash an entry another one still points at', async () => {
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Target' }, ...authenticated() })
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Source' }, ...authenticated() })
    await $fetch('/api/eponyme/articles/source', { method: 'PATCH', body: { related: ['target'] }, ...authenticated() })

    // Named rather than merely refused: the editor has to know where to go and detach it.
    await expect(trashEntry('articles/target'))
      .rejects.toMatchObject({ status: 409, data: { data: { referencedBy: ['articles/source'] } } })

    // The reference held by a draft counts, so dropping it is what unlocks the deletion.
    await $fetch('/api/eponyme/articles/source', { method: 'PATCH', body: { related: [] }, ...authenticated() })
    await expect(trashEntry('articles/target'))
      .resolves.toMatchObject({ deleted: true })

    await trashEntry('articles/source')
    await $fetch('/api/eponyme-trash/articles/target', { method: 'DELETE', ...authenticated() })
    await $fetch('/api/eponyme-trash/articles/source', { method: 'DELETE', ...authenticated() })
  })

  it('deletes only the submissions whose ids were sent', async () => {
    const before = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated())
    const created = await Promise.all(['Grace', 'Alan'].map(name => $fetch<{ id: string }>('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name, email: `${name.toLowerCase()}@example.com`, message: 'Selected for deletion.' },
    })))

    const deleted = await $fetch<{ deleted: number }>(
      `/api/eponyme-forms/contact/submissions?ids=${created.map(row => row.id).join(',')}`,
      { method: 'DELETE', ...authenticated() },
    )
    expect(deleted.deleted).toBe(2)

    // Everything that was not named is still there: a selection is not a "clear all".
    const after = await $fetch<{ total: number, submissions: Array<{ data: { name: string } }> }>(
      '/api/eponyme-forms/contact/submissions',
      authenticated(),
    )
    expect(after.total).toBe(before.total)
    expect(after.submissions.map(row => row.data.name)).not.toContain('Grace')
  })

  it('turns away bots and oversized bodies without storing anything', async () => {
    const before = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated())

    // A filled honeypot gets the normal success response, so the bot learns nothing.
    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Bot', email: 'bot@example.com', message: 'Spam.', _eponyme_hp: 'https://spam.example' },
    })).resolves.toMatchObject({ submitted: true })

    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Ada', email: 'ada@example.com', message: 'x'.repeat(2000) },
    })).rejects.toMatchObject({ status: 413 })

    const after = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated())
    expect(after.total).toBe(before.total)
  })

  it('stores a phone number in E.164, whatever format it was sent in', async () => {
    // Through an entry: the national number is rewritten before it is persisted.
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Phone' }, ...authenticated() })
    await saveAndPublish('articles/phone', { title: 'Phone', slug: 'phone', phone: '06 11 13 11 43' })
    await expect($fetch<{ data: { phone: string } }>('/api/eponyme/articles/phone'))
      .resolves.toMatchObject({ data: { phone: '+33611131143' } })

    // A number from a country the field does not accept is refused, not stored.
    const refused = await $fetch('/api/eponyme/articles/phone', {
      method: 'PATCH',
      body: { phone: '+1 415 555 2671' },
      ignoreResponseError: true,
      ...authenticated(),
    })
    expect(refused).toMatchObject({ errors: { phone: [expect.stringContaining('US')] } })
    await removeArticle('phone')

    // Through a public form: the stored submission is canonical too.
    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Ada', email: 'ada@example.com', phone: '06 11 13 11 43', message: 'Call me.' },
    })).resolves.toMatchObject({ submitted: true })
    const listed = await $fetch<{ submissions: Array<{ data: { phone: string } }> }>(
      '/api/eponyme-forms/contact/submissions',
      authenticated(),
    )
    expect(listed.submissions[0]!.data.phone).toBe('+33611131143')
    await $fetch('/api/eponyme-forms/contact/submissions', { method: 'DELETE', ...authenticated() })
  })

  it('stores a tag list normalised, whatever was sent', async () => {
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Tagged' }, ...authenticated() })
    await saveAndPublish('articles/tagged', {
      title: 'Tagged',
      slug: 'tagged',
      tags: ['Nuxt', ' nuxt ', 'GraphQL'],
    })
    // The duplicate folds away and a suggestion imposes its spelling, on the server.
    await expect($fetch<{ data: { tags: string[] } }>('/api/eponyme/articles/tagged'))
      .resolves.toMatchObject({ data: { tags: ['Nuxt', 'GraphQL'] } })

    // `maxItems` is counted after folding, so four entries collapsing to three are accepted.
    await saveAndPublish('articles/tagged', { tags: ['a', 'A', 'b', 'c'] })
    await expect($fetch<{ data: { tags: string[] } }>('/api/eponyme/articles/tagged'))
      .resolves.toMatchObject({ data: { tags: ['a', 'b', 'c'] } })

    const refused = await $fetch('/api/eponyme/articles/tagged', {
      method: 'PATCH',
      body: { tags: ['a', 'b', 'c', 'd'] },
      ignoreResponseError: true,
      ...authenticated(),
    })
    expect(refused).toMatchObject({ errors: { tags: ['Must contain at most 3 items.'] } })

    // The editor renders the field: `FieldRenderer` routes `tags` to its own component, whose
    // input is client-only, so the server-rendered proof is the label it wraps.
    const html = String(await $fetch('/__eponyme/articles/tagged', authenticated()))
    expect(html).toContain('Tags')

    await removeArticle('tagged')
  })

  it('keeps custom forms out of the managed submission route', async () => {
    // `newsletter` declares no submission mode, so it defaults to custom.
    await expect($fetch('/api/eponyme-forms/newsletter', {
      method: 'POST',
      body: { email: 'ada@example.com' },
    })).rejects.toMatchObject({ status: 404 })

    // The host application owns the route and calls validateEponymeForm().
    await expect($fetch('/newsletter', { method: 'POST', body: { email: 'ada@example.com' } }))
      .resolves.toMatchObject({ delivered: true, data: { email: 'ada@example.com' } })
    await expect($fetch('/newsletter', { method: 'POST', body: { email: 'nope' } }))
      .rejects.toMatchObject({ status: 422, data: { errors: { email: expect.any(Array) } } })
  })

  it('collects submissions a custom route stored itself', async () => {
    // Still no public endpoint: storing is the host route's decision, not a visitor's.
    await expect($fetch('/api/eponyme-forms/partnership', {
      method: 'POST',
      body: { company: 'Acme', email: 'ada@example.com' },
    })).rejects.toMatchObject({ status: 404 })

    await expect($fetch('/partnership', { method: 'POST', body: { company: 'Spam Inc', email: 'bot@example.com' } }))
      .rejects.toMatchObject({ status: 403 })

    // Validation still applies to what the route hands over.
    await expect($fetch('/partnership', { method: 'POST', body: { company: 'Acme', email: 'nope' } }))
      .rejects.toMatchObject({ status: 422, data: { errors: { email: expect.any(Array) } } })

    await expect($fetch('/partnership', { method: 'POST', body: { company: 'Acme', email: 'ada@example.com' } }))
      .resolves.toMatchObject({ stored: true, id: expect.any(String) })

    const listed = await $fetch<{ submissions: Array<{ data: { company: string } }>, total: number }>(
      '/api/eponyme-forms/partnership/submissions',
      authenticated(),
    )
    expect(listed.total).toBe(1)
    expect(listed.submissions[0]!.data).toMatchObject({ company: 'Acme', email: 'ada@example.com' })

    // And the dashboard shows the table rather than the "does not store" notice.
    const page = String(await $fetch('/__eponyme/partnership', authenticated()))
    expect(page).not.toContain('does not store its submissions')
    expect(page).toContain('Acme')
  })

  it('refuses to store a submission for a form that does not declare it', async () => {
    await expect($fetch('/newsletter-store', { method: 'POST', body: { email: 'ada@example.com' } }))
      .rejects.toMatchObject({ status: 500 })

    // Nothing was collected on the way out.
    await expect($fetch('/api/eponyme-forms/newsletter/submissions', authenticated()))
      .rejects.toMatchObject({ status: 404 })
  })

  it('rate-limits a custom route that opts in, the way the managed endpoint does', async () => {
    const limit = 20
    const post = () => $fetch('/throttled', { method: 'POST', body: { email: 'ada@example.com' } })

    for (let attempt = 0; attempt < limit; attempt++)
      await expect(post()).resolves.toMatchObject({ accepted: true })

    // Refused rather than merely counted, and carrying what a client needs to back off.
    const refused = await post().catch((error: { status: number, response: Response }) => error)
    expect(refused).toMatchObject({ status: 429 })
    const { response } = refused as { response: Response }
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(response.headers.get('x-ratelimit-limit')).toBe(String(limit))
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0')
  })

  it('renders a public form from the composable alone', async () => {
    const html = String(await $fetch('/contact'))
    // Labels and the honeypot come from the config, the markup from the host app.
    expect(html).toContain('id="contact-name"')
    expect(html).toContain('id="contact-email"')
    expect(html).toContain('Message')
    expect(html).toContain('name="_eponyme_hp"')
    // No dashboard styling or editor primitives leak into a public page.
    expect(html).not.toContain('ep:')
  })

  it('lists submissions in the dashboard and explains custom forms', async () => {
    await $fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Hopper', email: 'hopper@example.com', message: 'Dashboard row.' },
    })

    const html = String(await $fetch('/__eponyme/contact', authenticated()))
    // Table headers come from the field labels, rows from the stored submissions.
    expect(html).toContain('Message')
    expect(html).toContain('hopper@example.com')
    expect(html).toContain('managed')

    // The Received column renders a human date. The raw ISO value still appears in
    // the serialised Nuxt payload, so only the formatted form can be asserted.
    const listed = await $fetch<{ submissions: Array<{ createdAt: string }> }>('/api/eponyme-forms/contact/submissions', authenticated())
    const stored = listed.submissions[0]!.createdAt
    // The locale is pinned rather than ambient, so the server and the browser format
    // the same timestamp identically and hydration has nothing to disagree about.
    expect(html).toContain(new Intl.DateTimeFormat(EPONYME_DATE_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stored)))

    // A custom form has nothing to store, so it says so instead of showing a table.
    const custom = String(await $fetch('/__eponyme/newsletter', authenticated()))
    expect(custom).toContain('does not store its submissions')

    // Forms show up in the dashboard index next to entries and collections.
    expect(String(await $fetch('/__eponyme', authenticated()))).toContain('href="/__eponyme/contact"')
  })

  it('protects and deletes submissions', async () => {
    await $fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Grace', email: 'grace@example.com', message: 'Second message.' },
    })
    const listed = await $fetch<{ submissions: Array<{ id: string }> }>('/api/eponyme-forms/contact/submissions', authenticated())
    const target = listed.submissions[0]!

    await expect($fetch('/api/eponyme-forms/contact/submissions')).rejects.toMatchObject({ status: 401 })
    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`)).rejects.toMatchObject({ status: 401 })

    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`, authenticated()))
      .resolves.toMatchObject({ submission: { id: target.id } })
    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`, { method: 'DELETE', ...authenticated() }))
      .resolves.toEqual({ deleted: true })
    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`, authenticated()))
      .rejects.toMatchObject({ status: 404 })
  })

  it('clears every submission of a form at once', async () => {
    for (const name of ['Ada', 'Grace', 'Hopper']) {
      await $fetch('/api/eponyme-forms/contact', {
        method: 'POST',
        body: { name, email: `${name.toLowerCase()}@example.com`, message: 'Bulk delete.' },
      })
    }
    const before = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated())
    expect(before.total).toBeGreaterThanOrEqual(3)

    await expect($fetch('/api/eponyme-forms/contact/submissions', { method: 'DELETE' }))
      .rejects.toMatchObject({ status: 401 })
    await expect($fetch('/api/eponyme-forms/contact/submissions', { method: 'DELETE', ...authenticated() }))
      .resolves.toEqual({ deleted: before.total })

    await expect($fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated()))
      .resolves.toMatchObject({ total: 0 })

    // Clearing is scoped to the submissions path, never to the form itself.
    await expect($fetch('/api/eponyme-forms/contact', { method: 'DELETE', ...authenticated() }))
      .rejects.toMatchObject({ status: 404 })
  })

  it('enforces viewer permissions and serves user management routes', async () => {
    const created = await $fetch<{ user: { id: string }, temporaryPassword: string }>('/api/eponyme-users', {
      method: 'POST',
      body: { username: 'ReadOnlyUser', role: 'viewer' },
      ...authenticated(),
    })
    const reset = await $fetch<{ temporaryPassword: string }>(`/api/eponyme-users/${created.user.id}/reset-password`, {
      method: 'POST',
      ...authenticated(),
    })
    expect(reset.temporaryPassword).not.toBe(created.temporaryPassword)

    // A POST without the `/reset-password` suffix used to fall through to the reset handler.
    const strayPost = await fetch(url(`/api/eponyme-users/${created.user.id}`), {
      method: 'POST',
      headers: { cookie: authCookie },
    })
    expect(strayPost.status).toBeGreaterThanOrEqual(400)
    const afterStrayPost = await fetch(url('/api/eponyme-auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ReadOnlyUser', password: reset.temporaryPassword }),
    })
    // The password from the legitimate reset still works, so nothing was reset behind our back.
    expect(afterStrayPost.status).toBe(200)

    const loginResponse = await fetch(url('/api/eponyme-auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ReadOnlyUser', password: reset.temporaryPassword }),
    })
    const temporaryCookie = loginResponse.headers.get('set-cookie')?.split(';')[0] ?? ''
    const changeResponse = await fetch(url('/api/eponyme-auth/change-password'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': temporaryCookie },
      body: JSON.stringify({ currentPassword: reset.temporaryPassword, newPassword: 'Viewer password 123!' }),
    })
    const viewerCookie = changeResponse.headers.get('set-cookie')?.split(';')[0] ?? ''

    await expect($fetch('/api/eponyme/pages/homepage', {
      query: { version: 'draft' },
      headers: { cookie: viewerCookie },
    })).resolves.toMatchObject({ data: { title: 'Welcome' } })
    const forbidden = await fetch(url('/api/eponyme/pages/homepage?action=unpublish'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'cookie': viewerCookie },
      body: JSON.stringify({ title: 'Forbidden edit' }),
    })
    expect(forbidden.status).toBe(403)
    await expect($fetch('/api/eponyme/pages/homepage')).resolves.toMatchObject({ data: { title: 'Welcome' } })
  })

  it('keeps the system features an owner needs out of reach of a content rule', async () => {
    // `all` and `folder` describe content only, so the owner rules name every system feature.
    // Without them the dashboard would hide Users and Audit from the one role that owns them.
    const session = await $fetch<{ permissions: EponymePermissionRule[] }>('/api/eponyme-auth/session', authenticated())
    for (const name of ['content', 'media', 'users', 'audit'] as const) {
      expect(canEponyme(session.permissions, 'content.read', { kind: 'system', name })).toBe(true)
    }
    expect(canEponyme(session.permissions, 'users.manage', { kind: 'system', name: 'users' })).toBe(true)
    expect(canEponyme(session.permissions, 'audit.read', { kind: 'system', name: 'audit' })).toBe(true)

    // A viewer reads all content, and that must not spill into the media library.
    const viewerRules = [{
      effect: 'allow' as const,
      actions: ['content.read' as const, 'media.delete' as const],
      resources: [{ kind: 'all' as const }],
    }]
    expect(canEponyme(viewerRules, 'content.read', { kind: 'collection', name: 'articles' })).toBe(true)
    expect(canEponyme(viewerRules, 'media.delete', { kind: 'system', name: 'media' })).toBe(false)
  })

  it('enforces application roles across draft and publication actions', async () => {
    const roles = await $fetch<{ roles: Array<{ value: string }> }>('/api/eponyme-roles', authenticated())
    expect(roles.roles.map(role => role.value)).toEqual(expect.arrayContaining([
      'viewer',
      'editor',
      'owner',
      'contributor',
      'publisher',
    ]))

    const createSession = async (username: string, role: string, password: string) => {
      const created = await $fetch<{ temporaryPassword: string }>('/api/eponyme-users', {
        method: 'POST',
        body: { username, role },
        ...authenticated(),
      })
      const login = await fetch(url('/api/eponyme-auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: created.temporaryPassword }),
      })
      const temporaryCookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
      const changed = await fetch(url('/api/eponyme-auth/change-password'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': temporaryCookie },
        body: JSON.stringify({ currentPassword: created.temporaryPassword, newPassword: password }),
      })
      return changed.headers.get('set-cookie')?.split(';')[0] ?? ''
    }

    const contributorCookie = await createSession('WorkflowContributor', 'contributor', 'Contributor password 123!')
    const publisherCookie = await createSession('WorkflowPublisher', 'publisher', 'Publisher password 123!')
    const contributor = { headers: { cookie: contributorCookie } }
    const publisher = { headers: { cookie: publisherCookie } }

    await $fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Permission workflow' },
      ...contributor,
    })
    await $fetch('/api/eponyme/articles/permission-workflow', {
      method: 'PATCH',
      body: { excerpt: 'Prepared by the contributor.' },
      ...contributor,
    })
    await expect($fetch('/api/eponyme/articles/permission-workflow?action=publish', {
      method: 'PATCH',
      body: {},
      ...contributor,
    })).rejects.toMatchObject({ status: 403 })

    await expect($fetch('/api/eponyme/articles/permission-workflow', {
      method: 'PATCH',
      body: { excerpt: 'Publisher must not edit this.' },
      ...publisher,
    })).rejects.toMatchObject({ status: 403 })
    await expect($fetch('/api/eponyme/pages/homepage?version=draft', publisher))
      .rejects.toMatchObject({ status: 403 })
    await $fetch('/api/eponyme/articles/permission-workflow?action=publish', {
      method: 'PATCH',
      body: {},
      ...publisher,
    })
    await expect($fetch('/api/eponyme/articles/permission-workflow'))
      .resolves.toMatchObject({ data: { excerpt: 'Prepared by the contributor.' } })
    await expect($fetch('/api/eponyme-audit', publisher)).rejects.toMatchObject({ status: 403 })

    await removeArticle('permission-workflow')
  })

  it('renders one coherent action set for every application role', async () => {
    const configuredRoles = [
      'article-reader',
      'contributor',
      'publisher',
      'article-manager',
      'release-editor',
      'homepage-editor',
      'pages-editor',
      'form-reviewer',
      'form-manager',
      'media-reader',
      'media-librarian',
    ] as const
    const roles = await $fetch<{ roles: Array<{ value: string }> }>('/api/eponyme-roles', authenticated())
    expect(roles.roles.map(role => role.value)).toEqual(expect.arrayContaining([
      'viewer',
      'editor',
      'owner',
      ...configuredRoles,
    ]))

    const createSession = async (role: typeof configuredRoles[number], index: number) => {
      const username = `ButtonMatrix${index}`
      const created = await $fetch<{ temporaryPassword: string }>('/api/eponyme-users', {
        method: 'POST',
        body: { username, role },
        ...authenticated(),
      })
      const login = await fetch(url('/api/eponyme-auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: created.temporaryPassword }),
      })
      const temporaryCookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
      const changed = await fetch(url('/api/eponyme-auth/change-password'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': temporaryCookie },
        body: JSON.stringify({
          currentPassword: created.temporaryPassword,
          newPassword: `Button matrix password ${index}!`,
        }),
      })
      expect(changed.status).toBe(200)
      return { headers: { cookie: changed.headers.get('set-cookie')?.split(';')[0] ?? '' } }
    }

    const sessions = new Map<typeof configuredRoles[number], { headers: { cookie: string } }>()
    for (const [index, role] of configuredRoles.entries())
      sessions.set(role, await createSession(role, index + 1))

    await $fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Role button matrix' },
      ...authenticated(),
    })
    await $fetch('/api/eponyme/articles/role-button-matrix?action=draft', {
      method: 'PATCH',
      body: { title: 'Role button matrix', slug: 'role-button-matrix' },
      ...authenticated(),
    })
    await $fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Matrix', email: 'matrix@example.com', message: 'Permission matrix row.' },
    })

    try {
      const pageHtml = async (path: string, role: typeof configuredRoles[number]) => String(
        await $fetch(path, sessions.get(role)!),
      )
      const pageButtons = async (path: string, role: typeof configuredRoles[number]) => buttonLabels(
        await pageHtml(path, role),
      )
      const count = (buttons: string[], label: string) => buttons.filter(button => button === label).length

      const readerHtml = await pageHtml('/__eponyme/articles/role-button-matrix', 'article-reader')
      const reader = buttonLabels(readerHtml)
      expect(count(reader, 'Save draft')).toBe(0)
      expect(count(reader, 'Publish')).toBe(0)
      expect(count(reader, 'Publication')).toBe(1)
      expect(buttonMarkup(readerHtml, 'Upload a file')).toMatch(/\sdisabled(?:=""|(?=[\s>]))/)

      const contributorHtml = await pageHtml('/__eponyme/articles/role-button-matrix', 'contributor')
      const contributor = buttonLabels(contributorHtml)
      expect(count(contributor, 'Save draft')).toBe(1)
      expect(count(contributor, 'Publish')).toBe(0)
      expect(count(contributor, 'Publication')).toBe(1)
      expect(buttonMarkup(contributorHtml, 'Upload a file')).toMatch(/\sdisabled(?:=""|(?=[\s>]))/)

      const ownerHtml = String(await $fetch('/__eponyme/articles/role-button-matrix', authenticated()))
      expect(buttonMarkup(ownerHtml, 'Upload a file')).not.toMatch(/\sdisabled(?:=""|(?=[\s>]))/)

      const publisher = await pageButtons('/__eponyme/articles/role-button-matrix', 'publisher')
      expect(count(publisher, 'Publish')).toBeGreaterThan(0)
      expect(count(publisher, 'Save draft')).toBe(0)
      expect(count(publisher, 'Publication')).toBe(1)

      const articleManager = await pageButtons('/__eponyme/articles/role-button-matrix', 'article-manager')
      expect(count(articleManager, 'Publish')).toBeGreaterThan(0)
      expect(count(articleManager, 'Save draft')).toBe(1)
      expect(count(articleManager, 'Publication')).toBe(1)

      const releaseEditor = await pageButtons('/__eponyme/releases', 'release-editor')
      expect(count(releaseEditor, 'Publish')).toBe(0)
      expect(count(releaseEditor, 'Publication')).toBe(0)

      const homepageEditor = await pageButtons('/__eponyme/pages/homepage', 'homepage-editor')
      expect(count(homepageEditor, 'Save draft')).toBe(1)
      expect(count(homepageEditor, 'Publish')).toBe(0)

      const pagesEditor = await pageButtons('/__eponyme/pages/homepage', 'pages-editor')
      expect(count(pagesEditor, 'Save draft')).toBe(1)
      const protectedPage = await pageButtons('/__eponyme/pages/frozen', 'pages-editor')
      expect(count(protectedPage, 'Save draft')).toBe(0)

      const formReviewer = await pageButtons('/__eponyme/contact', 'form-reviewer')
      expect(count(formReviewer, 'Clear all')).toBe(0)
      expect(count(formReviewer, 'Delete')).toBe(0)
      const formManager = await pageButtons('/__eponyme/contact', 'form-manager')
      expect(count(formManager, 'Clear all')).toBe(1)
      expect(count(formManager, 'Delete')).toBe(1)

      const mediaReader = await pageButtons('/__eponyme/media', 'media-reader')
      expect(count(mediaReader, 'Upload')).toBe(0)
      const mediaLibrarian = await pageButtons('/__eponyme/media', 'media-librarian')
      expect(count(mediaLibrarian, 'Upload')).toBe(1)
    }
    finally {
      await $fetch('/api/eponyme-forms/contact/submissions', { method: 'DELETE', ...authenticated() })
      await removeArticle('role-button-matrix')
    }
  })

  it('refuses the publication actions of a collection that disabled them', async () => {
    await $fetch('/api/eponyme-collections/releases', { method: 'POST', body: { title: 'Cut' }, ...authenticated() })

    for (const action of ['schedule', 'unpublish', 'revertToDraft']) {
      const refused = await fetch(url(`/api/eponyme/releases/cut?action=${action}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'cookie': authCookie },
        body: JSON.stringify({ data: { title: 'Cut', slug: 'cut' }, scheduledUnpublishAt: '2099-01-01T00:00:00.000Z' }),
      })
      expect(refused.status).toBe(422)
    }

    // Publishing and saving a draft are what the toolbar still offers, so they must go through.
    await expect($fetch('/api/eponyme/releases/cut?action=draft', {
      method: 'PATCH',
      body: { title: 'Cut', slug: 'cut' },
      ...authenticated(),
    })).resolves.toMatchObject({ data: { title: 'Cut' } })
    await expect($fetch('/api/eponyme/releases/cut?action=publish', {
      method: 'PATCH',
      body: {},
      ...authenticated(),
    })).resolves.toMatchObject({ status: 'published' })
    // `unschedule` stays allowed: it is the only way out for an entry scheduled beforehand.
    await expect($fetch('/api/eponyme/releases/cut?action=unschedule', {
      method: 'PATCH',
      body: {},
      ...authenticated(),
    })).resolves.toBeTruthy()

    await trashEntry('releases/cut')
    await $fetch('/api/eponyme-trash/releases/cut', { method: 'DELETE', ...authenticated() })
  })

  it('refuses the publication actions of a singleton disabled by name', async () => {
    for (const action of ['schedule', 'unpublish', 'revertToDraft']) {
      const refused = await fetch(url(`/api/eponyme/pages/frozen?action=${action}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'cookie': authCookie },
        body: JSON.stringify({ data: { title: 'Frozen' }, scheduledUnpublishAt: '2099-01-01T00:00:00.000Z' }),
      })
      expect(refused.status).toBe(422)
    }

    // Saving stays available, and leaves this singleton unpublished so the statuses
    // endpoint keeps the exact shape the earlier test asserts.
    await expect($fetch('/api/eponyme/pages/frozen?action=draft', {
      method: 'PATCH',
      body: { title: 'Frozen' },
      ...authenticated(),
    })).resolves.toMatchObject({ data: { title: 'Frozen' } })
  })

  it('searches submissions server-side, across the pager', async () => {
    for (const name of ['Ada Lovelace', 'Grace Hopper', 'Alan Turing']) {
      await $fetch('/api/eponyme-forms/contact', {
        method: 'POST',
        body: { name, email: `${name.split(' ')[0]!.toLowerCase()}@example.com`, message: 'Hello there.' },
      })
    }

    const all = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated())
    expect(all.total).toBe(3)

    // The count carries the filter too, so the pager cannot offer pages the search empties.
    const byName = await $fetch<{ submissions: Array<{ data: { name: string } }>, total: number }>(
      '/api/eponyme-forms/contact/submissions',
      { query: { search: 'Grace' }, ...authenticated() },
    )
    expect(byName.total).toBe(1)
    expect(byName.submissions[0]!.data.name).toBe('Grace Hopper')

    // A field the form declares, other than the one the table sorts on.
    const byEmail = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', {
      query: { search: 'alan@example.com' },
      ...authenticated(),
    })
    expect(byEmail.total).toBe(1)

    // Case is not the editor's problem: nobody types an address back in its stored casing.
    await expect($fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', {
      query: { search: 'grace hopper' },
      ...authenticated(),
    })).resolves.toMatchObject({ total: 1 })

    // Every submission shares this message, so the search reaches beyond the first page.
    const byMessage = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', {
      query: { search: 'Hello there', perPage: 2 },
      ...authenticated(),
    })
    expect(byMessage.total).toBe(3)

    await expect($fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', {
      query: { search: 'nobody' },
      ...authenticated(),
    })).resolves.toMatchObject({ total: 0 })

    await $fetch('/api/eponyme-forms/contact/submissions', { method: 'DELETE', ...authenticated() })
  })

  it('refuses to let the signed-in owner change their own role or status', async () => {
    const { users } = await $fetch<{ users: Array<{ id: string, username: string }> }>('/api/eponyme-users', authenticated())
    const self = users.find(user => user.username === 'EponymeOwner')!

    for (const body of [{ active: false }, { role: 'viewer' }]) {
      const refused = await fetch(url(`/api/eponyme-users/${self.id}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'cookie': authCookie },
        body: JSON.stringify(body),
      })
      expect(refused.status).toBe(422)
      // The wording proves the actor reached the service: the last-owner rule has its own.
      const refusal = await refused.json()
      expect(refusal).toMatchObject({
        statusCode: 422,
        message: 'You cannot change the role or the status of your own account.',
      })
    }

    await expect($fetch('/api/eponyme-users', authenticated()))
      .resolves.toMatchObject({ users: expect.arrayContaining([expect.objectContaining({ username: 'EponymeOwner', role: 'owner', active: true })]) })
  })

  it('exposes the security and editorial audit log only to owners', async () => {
    const { users } = await $fetch<{ users: Array<{ id: string, username: string }> }>('/api/eponyme-users', authenticated())
    const contributor = users.find(user => user.username === 'WorkflowContributor')!
    await $fetch(`/api/eponyme-users/${contributor.id}`, {
      method: 'PATCH',
      body: { role: 'viewer' },
      ...authenticated(),
    })

    const audit = async (action: string) => await $fetch<EponymeAuditPage>('/api/eponyme-audit', {
      query: { action },
      ...authenticated(),
    })
    await expect(audit('user.role_changed')).resolves.toMatchObject({
      events: [expect.objectContaining({
        actorUsername: 'EponymeOwner',
        targetUserId: contributor.id,
        metadata: { previousRole: 'contributor', nextRole: 'viewer' },
      })],
    })
    await expect(audit('content.published')).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ outcome: 'success' })]),
    })
    await expect(audit('content.restored_from_trash')).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ outcome: 'success' })]),
    })
    await expect(audit('content.purged')).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ outcome: 'success' })]),
    })
    await expect(audit('user.password_reset')).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ outcome: 'success' })]),
    })
    await expect(audit('auth.login.failed')).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({
        actorUsername: 'eponymeowner',
        outcome: 'failure',
        ipAddress: expect.any(String),
        userAgent: expect.any(String),
      })]),
    })

    const html = String(await $fetch('/__eponyme/audit', authenticated()))
    expect(html).toContain('Audit log')
  })

  it('exports the content and imports it back, with import reserved to owners', async () => {
    await $fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Export round trip', excerpt: 'Written on dev' },
      ...authenticated(),
    })

    const file = await $fetch<EponymeExportFile>('/api/eponyme-export', authenticated())
    expect(file.eponyme.format).toBe(1)
    // Forms own their submissions, so they are not part of a content export.
    expect(Object.keys(file.eponyme.schemas).sort()).toEqual(['articles', 'pages/frozen', 'pages/homepage', 'releases'])
    expect(file.entries.map(entry => entry.name)).toContain('articles/export-round-trip')

    // Simulate the target environment drifting, then bring it back with the file.
    await $fetch('/api/eponyme/articles/export-round-trip', {
      method: 'PATCH',
      body: { excerpt: 'Overwritten in production' },
      ...authenticated(),
    })
    const beforeDryRun = (await $fetch<{ seen: string[] }>('/_hooks')).seen.length
    await expect($fetch('/api/eponyme-import', {
      method: 'POST',
      query: { dryRun: 1 },
      body: file,
      ...authenticated(),
    })).resolves.toMatchObject({ dryRun: true, created: 0, skipped: [] })
    // A dry run writes nothing, so it must announce nothing either.
    const beforeImport = (await $fetch<{ seen: string[] }>('/_hooks')).seen
    expect(beforeImport.length).toBe(beforeDryRun)

    const imported = await $fetch<Record<string, unknown>>('/api/eponyme-import', { method: 'POST', body: file, ...authenticated() })
    expect(imported).toMatchObject({ dryRun: false, skipped: [] })
    // The written entries are what the hooks are built from, and stay on the server.
    expect(imported).not.toHaveProperty('written')
    // An import is a write like any other: it announces itself, which is where a host
    // purges the CDN copies the import just made stale.
    const announced = (await $fetch<{ seen: string[] }>('/_hooks')).seen.slice(beforeImport.length)
    expect(announced.some(entry => entry.includes('articles/export-round-trip'))).toBe(true)
    await expect($fetch('/api/eponyme/articles/export-round-trip', {
      query: { version: 'draft' },
      ...authenticated(),
    })).resolves.toMatchObject({ data: { excerpt: 'Written on dev' } })

    // A divergent schema is refused as a whole, and names what diverged.
    const tampered = { ...file, eponyme: { ...file.eponyme, schemas: { ...file.eponyme.schemas, articles: 'not-the-same-schema' } } }
    await expect($fetch('/api/eponyme-import', { method: 'POST', body: tampered, ...authenticated() }))
      .rejects.toMatchObject({ status: 409, data: { data: { schemaMismatch: ['articles'] } } })

    // An editor may export, but overwriting the whole site stays with owners.
    const editor = await $fetch<{ user: { id: string }, temporaryPassword: string }>('/api/eponyme-users', {
      method: 'POST',
      body: { username: 'ImportEditor', role: 'editor' },
      ...authenticated(),
    })
    const editorLogin = await fetch(url('/api/eponyme-auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ImportEditor', password: editor.temporaryPassword }),
    })
    const temporaryCookie = editorLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
    const changed = await fetch(url('/api/eponyme-auth/change-password'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': temporaryCookie },
      body: JSON.stringify({ currentPassword: editor.temporaryPassword, newPassword: 'Editor password 123!' }),
    })
    const editorCookie = changed.headers.get('set-cookie')?.split(';')[0] ?? ''

    await expect($fetch('/api/eponyme-export', { headers: { cookie: editorCookie } }))
      .resolves.toMatchObject({ eponyme: { format: 1 } })
    const refused = await fetch(url('/api/eponyme-import'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': editorCookie },
      body: JSON.stringify(file),
    })
    expect(refused.status).toBe(403)

    await removeArticle('export-round-trip')
  })

  /**
   * Published content is cached by browsers and CDNs, which makes the boundary around
   * everything else load-bearing: a draft or a session that leaked into a shared cache
   * would be served to people who were never allowed to see it.
   */
  describe('cache headers', () => {
    const cacheControl = async (path: string, options?: RequestInit) =>
      (await fetch(url(path), options)).headers.get('cache-control')

    it('lets a browser and a CDN keep published content', async () => {
      // The browser window is the short one because nothing can purge it.
      expect(await cacheControl('/api/eponyme/pages/homepage'))
        .toBe('public, max-age=30, s-maxage=300, stale-while-revalidate=3600')
      expect(await cacheControl('/api/eponyme-collections/articles')).toContain('public')
      expect(await cacheControl('/api/eponyme-sitemap')).toContain('public')
    })

    it('never lets anything unpublished or personal be stored', async () => {
      const private_ = [
        '/api/eponyme/pages/homepage?version=draft',
        // Unresolved `{{ variables }}`: published, but not what a public page renders.
        '/api/eponyme/pages/homepage?raw=1',
        '/api/eponyme-collections/articles?version=draft',
        '/api/eponyme-statuses',
        '/api/eponyme-history/pages/homepage',
        '/api/eponyme-trash/articles',
        '/api/eponyme-users',
        '/api/eponyme-export',
        // Answers who the caller is, so it is the one that must never be shared.
        '/api/eponyme-auth/session',
      ]
      for (const path of private_)
        expect(await cacheControl(path, authenticated()), path).toBe('no-store')
    })

    it('tags a cached response with what a purge will name', async () => {
      const tags = async (path: string) => (await fetch(url(path))).headers.get('vercel-cache-tag')
      await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Tagged entry' }, ...authenticated() })
      await saveAndPublish('articles/tagged-entry', { title: 'Tagged entry', slug: 'tagged-entry' })

      expect(await tags('/api/eponyme/pages/homepage')).toBe('eponyme,eponyme:pages/homepage')
      // A collection entry also carries its collection, so publishing it drops the listing
      // that shows it and not only its own page.
      expect(await tags('/api/eponyme/articles/tagged-entry')).toBe('eponyme,eponyme:articles/tagged-entry,eponyme:articles')
      expect(await tags('/api/eponyme-collections/articles')).toBe('eponyme,eponyme:articles')
      // Nothing uncacheable is tagged: there would be nothing to purge.
      expect(await tags('/api/eponyme-auth/session')).toBeNull()

      await removeArticle('tagged-entry')
    })

    it('holds back a route that never opted in, even unauthenticated', async () => {
      // The default comes from the middleware, so it applies before any handler runs
      // and regardless of whether the request is allowed through.
      expect(await cacheControl('/api/eponyme-users')).toBe('no-store')
      expect(await cacheControl('/api/eponyme/pages/homepage?version=draft')).toBe('no-store')
    })
  })
  it('rejects an unknown editorial action instead of publishing it', async () => {
    const response = await fetch(url('/api/eponyme/pages/homepage?action=not-an-action'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'cookie': authCookie },
      body: JSON.stringify({ title: 'Must not be published' }),
    })
    expect(response.status).toBe(400)
    await expect($fetch('/api/eponyme/pages/homepage')).resolves.toMatchObject({ data: { title: 'Welcome' } })
  })

  it('keeps managed-form storage within its configured quota', async () => {
    for (const value of ['first', 'second', 'third']) {
      await $fetch('/api/eponyme-forms/limited', { method: 'POST', body: { value } })
    }

    const listed = await $fetch<{ submissions: Array<{ data: { value: string } }>, total: number }>(
      '/api/eponyme-forms/limited/submissions',
      authenticated(),
    )
    expect(listed.total).toBe(2)
    expect(listed.submissions.map(item => item.data.value)).toEqual(['third', 'second'])
    await $fetch('/api/eponyme-forms/limited/submissions', { method: 'DELETE', ...authenticated() })
  })

  describe('media routes', () => {
    const reserve = (body: unknown) => fetch(url('/api/eponyme-media/upload'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': authCookie },
      body: JSON.stringify(body),
    })

    afterAll(async () => {
      await rm('.eponyme/test-media', { recursive: true, force: true })
    })

    it('refuses every media route without a session', async () => {
      const statuses = await Promise.all([
        fetch(url('/api/eponyme-media')),
        fetch(url('/api/eponyme-media/upload'), { method: 'POST', body: '{}' }),
        fetch(url('/api/eponyme-media/object?key=uploads/a.txt'), { method: 'DELETE' }),
      ].map(async promise => (await promise).status))
      expect(statuses).toEqual([401, 401, 401])
    })

    it('uploads, lists, reads back and deletes', async () => {
      const ticket = await (await reserve({ name: 'Rapport été.txt', contentType: 'text/plain', size: 5 })).json()
      // No third party to sign for, so the bytes go through the application's own route.
      expect(ticket.mode).toBe('direct')
      expect(ticket.key).toMatch(/^uploads\/\d{4}\/\d{2}\/rapport-ete-[a-z0-9]{6}\.txt$/)
      expect(ticket.publicUrl).toBe(`/api/eponyme-media/raw/${ticket.key.split('/').map(encodeURIComponent).join('/')}`)

      const uploaded = await fetch(url(ticket.url), {
        method: 'PUT',
        headers: { 'content-type': 'text/plain', 'cookie': authCookie },
        body: 'hello',
      })
      expect(uploaded.status).toBe(200)

      const listing = await $fetch<{ items: Array<{ key: string }>, cursor: string | null }>('/api/eponyme-media', authenticated())
      expect(listing.items.map(item => item.key)).toContain(ticket.key)
      expect(listing.cursor).toBeNull()

      // Read without a session: this URL is what a public page renders.
      const read = await fetch(url(ticket.publicUrl))
      expect(read.status).toBe(200)
      expect(read.headers.get('content-type')).toBe('text/plain')
      expect(await read.text()).toBe('hello')

      const deleted = await fetch(url(`/api/eponyme-media/object?key=${encodeURIComponent(ticket.key)}`), {
        method: 'DELETE',
        headers: { cookie: authCookie },
      })
      expect(deleted.status).toBe(204)
      expect((await fetch(url(ticket.publicUrl))).status).toBe(404)
    })

    it('refuses an upload the configuration does not allow', async () => {
      expect((await reserve({ name: 'a.txt', contentType: 'text/plain', size: 0 })).status).toBe(400)
      expect((await reserve({ name: 'a.txt', contentType: 'not a type', size: 5 })).status).toBe(400)
      expect((await reserve({ name: 'a.bin', contentType: 'text/plain', size: 999_999_999 })).status).toBe(413)
    })

    // The reservation is not a promise the bytes have to keep: only a presigned upload is bound to
    // its declared size, by the provider's own signature. The direct route re-checks the limits
    // against what actually arrives, which is what a client lying at reservation time runs into.
    it('re-checks the limits on the bytes, not on what was reserved', async () => {
      const ticket = await (await reserve({ name: 'lie.txt', contentType: 'text/plain', size: 5 })).json()
      const rejected = await fetch(url(ticket.url), {
        method: 'PUT',
        headers: { 'content-type': 'text/html', 'cookie': authCookie },
        body: 'x',
      })
      expect(rejected.status).toBe(415)
      expect((await fetch(url(ticket.publicUrl))).status).toBe(404)
    })

    it('keeps a key outside the upload prefix unreachable', async () => {
      for (const key of ['../secret.txt', '/etc/passwd', 'elsewhere/file.txt']) {
        const response = await fetch(url(`/api/eponyme-media/object?key=${encodeURIComponent(key)}`), {
          method: 'DELETE',
          headers: { cookie: authCookie },
        })
        expect(response.status).toBe(400)
      }
      expect((await fetch(url('/api/eponyme-media/raw/elsewhere/file.txt'))).status).toBe(400)
    })

    it('shows the media entry in the dashboard sidebar', async () => {
      const html = await $fetch<string>('/__eponyme', authenticated())
      expect(html).toContain('href="/__eponyme/media"')
    })
  })
})
