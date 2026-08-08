import { fileURLToPath } from 'node:url'
import { beforeAll, describe, it, expect } from 'vitest'
import { setup, $fetch, url } from '@nuxt/test-utils/e2e'
import { EPONYME_DATE_LOCALE } from '../src/runtime/utils/date-locale'
import type { EponymeExportFile } from '../src/runtime/server/services/eponyme-store'

describe('ssr', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })
  let authCookie = ''
  const authenticated = () => ({ headers: { cookie: authCookie } })
  // Deleting only moves an entry to the trash, where it keeps its slug. Tests share
  // one database and reuse slugs, so cleanup has to purge as well.
  const removeArticle = async (slug: string) => {
    await $fetch(`/api/eponyme-collections/articles/${slug}`, { method: 'DELETE', ...authenticated() })
    await $fetch(`/api/eponyme-trash/articles/${slug}`, { method: 'DELETE', ...authenticated() })
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
  })

  it('exposes and updates Eponyme data', async () => {
    await expect($fetch('/api/eponyme-statuses', authenticated())).resolves.toEqual({
      statuses: { 'pages/homepage': 'published' },
    })

    await expect($fetch('/api/eponyme/pages/homepage')).resolves.toEqual({
      data: { title: 'Welcome', maxGuests: 10, enabled: true, tags: ['nuxt'], meta: { description: 'Homepage description' } },
    })

    await expect($fetch('/api/eponyme/pages/homepage', {
      method: 'PATCH',
      body: { maxGuests: 12 },
      ...authenticated(),
    })).resolves.toEqual({
      data: { title: 'Welcome', maxGuests: 12, enabled: true, tags: ['nuxt'], meta: { description: 'Homepage description' } },
    })

    await $fetch('/api/eponyme/pages/homepage?action=draft', {
      method: 'PATCH',
      body: { maxGuests: 14 },
      ...authenticated(),
    })
    await expect($fetch('/api/eponyme-statuses', authenticated())).resolves.toEqual({
      statuses: { 'pages/homepage': 'published' },
    })
  })

  it('rejects invalid Eponyme data', async () => {
    const response = await $fetch('/api/eponyme/pages/homepage', {
      method: 'PATCH',
      body: { maxGuests: 100, unknown: true },
      ignoreResponseError: true,
      ...authenticated(),
    })
    expect(response).toEqual({
      errors: {
        maxGuests: ['Must be at most 20.'],
        unknown: ['Unknown field.'],
      },
    })
  })

  it('resolves content variables for the public API but not for the editor', async () => {
    const year = new Date().getFullYear()
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Variables' }, ...authenticated() })
    await $fetch('/api/eponyme/articles/variables?action=publish', {
      method: 'PATCH',
      body: { title: 'Variables', slug: 'variables', excerpt: 'Saison {{ season }} au {{ clubName }}, en {{ currentYear }}.' },
      ...authenticated(),
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
    await $fetch('/api/eponyme/articles/injection?action=publish', {
      method: 'PATCH',
      body: { title: 'Injection', slug: 'injection', excerpt },
      ...authenticated(),
    })

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
      body: { title: 'Hooked' },
      ...authenticated(),
    })
    await $fetch('/api/eponyme/pages/homepage?action=schedule', {
      method: 'PATCH',
      body: {
        data: { title: 'Hooked' },
        scheduledUnpublishAt: '2099-01-01T00:00:00.000Z',
      },
      ...authenticated(),
    })
    await $fetch('/api/eponyme/pages/homepage?action=unschedule', {
      method: 'PATCH',
      body: { title: 'Hooked' },
      ...authenticated(),
    })
    await $fetch('/api/eponyme/pages/homepage?action=unpublish', {
      method: 'PATCH',
      body: { title: 'Hooked' },
      ...authenticated(),
    })
    await expect($fetch('/api/eponyme/pages/homepage')).rejects.toMatchObject({ statusCode: 404 })
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
      body: { title: 'Welcome' },
      ...authenticated(),
    })
  })

  it('lets a blocking hook reject or amend a write', async () => {
    await expect($fetch('/api/eponyme/pages/homepage?action=draft', {
      method: 'PATCH',
      body: { title: 'reject-me' },
      ...authenticated(),
    })).rejects.toMatchObject({ statusCode: 422 })

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
    })).rejects.toMatchObject({ statusCode: 422 })

    await $fetch('/api/eponyme/pages/homepage?action=publish', {
      method: 'PATCH',
      body: { title: 'Welcome' },
      ...authenticated(),
    })
  })

  it('renders a nested Eponyme dashboard page', async () => {
    const html = String(await $fetch('/__eponyme/pages/homepage', authenticated()))
    expect(html).toContain('homepage')
    expect(html).toContain('href="/__eponyme/pages/homepage"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    const activeLink = html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]
    expect(activeLink).toContain('href="/__eponyme/pages/homepage"')
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

    await $fetch('/api/eponyme/articles/sitemap-article?action=publish', {
      method: 'PATCH',
      body: { title: 'Sitemap article', slug: 'sitemap-article', excerpt: 'Listed publicly.' },
      ...authenticated(),
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

    await $fetch('/api/eponyme/articles/first-article?action=publish', {
      method: 'PATCH',
      body: { title: 'First article', slug: 'first-article', excerpt: 'A public article.' },
      ...authenticated(),
    })
    await expect($fetch('/api/eponyme-collections/articles')).resolves.toMatchObject({
      entries: [{ slug: 'first-article', title: 'First article', data: { excerpt: 'A public article.' } }],
    })
    const html = String(await $fetch('/__eponyme/articles/first-article', authenticated()))
    expect(html).toContain('First article')

    await expect($fetch('/api/eponyme-collections/articles/first-article', { method: 'DELETE', ...authenticated() })).resolves.toEqual({ deleted: true })
    await $fetch('/api/eponyme-trash/articles/first-article', { method: 'DELETE', ...authenticated() })
  })

  it('trashes, restores and purges a collection entry over HTTP', async () => {
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Trashed article' }, ...authenticated() })
    await $fetch('/api/eponyme/articles/trashed-article?action=publish', {
      method: 'PATCH',
      body: { title: 'Trashed article', slug: 'trashed-article', excerpt: 'Soon in the trash.' },
      ...authenticated(),
    })

    await expect($fetch('/api/eponyme-collections/articles/trashed-article', { method: 'DELETE', ...authenticated() })).resolves.toEqual({ deleted: true })
    // Gone from every read, including the public ones.
    await expect($fetch('/api/eponyme-collections/articles')).resolves.toEqual({ entries: [], total: 0 })
    await expect($fetch('/api/eponyme/articles/trashed-article')).rejects.toMatchObject({ statusCode: 404 })
    await expect($fetch<{ entries: Array<{ loc: string }> }>('/api/eponyme-sitemap').then(result => result.entries.map(entry => entry.loc))).resolves.toEqual(['/'])
    await expect($fetch<{ entries: Array<{ slug: string }> }>('/api/eponyme-trash/articles', authenticated()))
      .resolves.toMatchObject({ entries: [{ slug: 'trashed-article' }], total: 1 })
    // The trash is never public.
    await expect($fetch('/api/eponyme-trash/articles')).rejects.toMatchObject({ statusCode: 401 })
    // And the slug it holds cannot be taken back by a new entry.
    await expect($fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Retake', slug: 'trashed-article' },
      ignoreResponseError: true,
      ...authenticated(),
    })).resolves.toMatchObject({ errors: { slug: [expect.stringContaining('trash')] } })

    await expect($fetch('/api/eponyme-trash/articles/trashed-article', { method: 'PATCH', ...authenticated() })).resolves.toEqual({ restored: true })
    await expect($fetch('/api/eponyme-collections/articles')).resolves.toMatchObject({ entries: [{ slug: 'trashed-article' }] })
    // Restoring kept the history the hard delete used to destroy.
    const { history } = await $fetch<{ history: unknown[] }>('/api/eponyme-history/articles/trashed-article', authenticated())
    expect(history.length).toBeGreaterThan(0)

    await $fetch('/api/eponyme-collections/articles/trashed-article', { method: 'DELETE', ...authenticated() })
    await expect($fetch('/api/eponyme-trash/articles/trashed-article', { method: 'DELETE', ...authenticated() })).resolves.toEqual({ purged: true })
    await expect($fetch('/api/eponyme-trash/articles', authenticated())).resolves.toEqual({ entries: [], total: 0 })
    // Purged for good: the slug is free again.
    await expect($fetch('/api/eponyme-trash/articles/trashed-article', { method: 'DELETE', ...authenticated() })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('filters a collection over HTTP', async () => {
    const write = async (title: string, tags: string[]) => {
      const slug = title.toLowerCase().replace(/ /g, '-')
      await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title }, ...authenticated() })
      await $fetch(`/api/eponyme/articles/${slug}?action=publish`, {
        method: 'PATCH',
        body: { title, slug, tags },
        ...authenticated(),
      })
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
    await expect($fetch('/api/eponyme-collections/articles?where[nope]=x')).rejects.toMatchObject({ statusCode: 400 })
    // `excerpt` is free text, so it is not filterable even though it exists.
    await expect($fetch('/api/eponyme-collections/articles?where[excerpt]=x')).rejects.toMatchObject({ statusCode: 400 })
    await expect($fetch('/api/eponyme-collections/articles?where[tags][like]=x')).rejects.toMatchObject({ statusCode: 400 })

    // `not` excludes, and reaches the entry that carries no tag at all — which has no index
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
      await $fetch(`/api/eponyme/articles/${slug}?action=publish`, {
        method: 'PATCH',
        body: { title, slug, excerpt: `Excerpt for ${title}.` },
        ...authenticated(),
      })
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
    await expect($fetch('/api/eponyme-collections/articles?orderBy=nope')).rejects.toMatchObject({ statusCode: 400 })

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

    await $fetch('/api/eponyme/articles/preview-article?action=publish', {
      method: 'PATCH',
      body: { title: 'Preview article', slug: 'preview-article', excerpt: 'First excerpt.' },
      ...authenticated(),
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
      statusCode: 422,
      data: { errors: { email: expect.any(Array), message: expect.any(Array), name: expect.any(Array) } },
    })

    // Unknown fields are refused rather than silently stored.
    await expect($fetch('/api/eponyme-forms/contact', {
      method: 'POST',
      body: { name: 'Ada', email: 'ada@example.com', message: 'Hi.', role: 'admin' },
    })).rejects.toMatchObject({ statusCode: 422, data: { errors: { role: ['Unknown field.'] } } })

    const listed = await $fetch<{ submissions: Array<{ data: { name: string } }>, total: number }>(
      '/api/eponyme-forms/contact/submissions',
      authenticated(),
    )
    expect(listed.total).toBe(1)
    expect(listed.submissions[0]!.data).toMatchObject({ name: 'Ada', email: 'ada@example.com' })
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
    })).rejects.toMatchObject({ statusCode: 413 })

    const after = await $fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated())
    expect(after.total).toBe(before.total)
  })

  it('stores a phone number in E.164, whatever format it was sent in', async () => {
    // Through an entry: the national number is rewritten before it is persisted.
    await $fetch('/api/eponyme-collections/articles', { method: 'POST', body: { title: 'Phone' }, ...authenticated() })
    await $fetch('/api/eponyme/articles/phone?action=publish', {
      method: 'PATCH',
      body: { title: 'Phone', slug: 'phone', phone: '06 11 13 11 43' },
      ...authenticated(),
    })
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
    await $fetch('/api/eponyme/articles/tagged?action=publish', {
      method: 'PATCH',
      body: { title: 'Tagged', slug: 'tagged', tags: ['Nuxt', ' nuxt ', 'GraphQL'] },
      ...authenticated(),
    })
    // The duplicate folds away and a suggestion imposes its spelling, on the server.
    await expect($fetch<{ data: { tags: string[] } }>('/api/eponyme/articles/tagged'))
      .resolves.toMatchObject({ data: { tags: ['Nuxt', 'GraphQL'] } })

    // `maxItems` is counted after folding, so four entries collapsing to three are accepted.
    await $fetch('/api/eponyme/articles/tagged?action=publish', {
      method: 'PATCH',
      body: { tags: ['a', 'A', 'b', 'c'] },
      ...authenticated(),
    })
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
    })).rejects.toMatchObject({ statusCode: 404 })

    // The host application owns the route and calls validateEponymeForm().
    await expect($fetch('/newsletter', { method: 'POST', body: { email: 'ada@example.com' } }))
      .resolves.toMatchObject({ delivered: true, data: { email: 'ada@example.com' } })
    await expect($fetch('/newsletter', { method: 'POST', body: { email: 'nope' } }))
      .rejects.toMatchObject({ statusCode: 422, data: { errors: { email: expect.any(Array) } } })
  })

  it('collects submissions a custom route stored itself', async () => {
    // Still no public endpoint: storing is the host route's decision, not a visitor's.
    await expect($fetch('/api/eponyme-forms/partnership', {
      method: 'POST',
      body: { company: 'Acme', email: 'ada@example.com' },
    })).rejects.toMatchObject({ statusCode: 404 })

    await expect($fetch('/partnership', { method: 'POST', body: { company: 'Spam Inc', email: 'bot@example.com' } }))
      .rejects.toMatchObject({ statusCode: 403 })

    // Validation still applies to what the route hands over.
    await expect($fetch('/partnership', { method: 'POST', body: { company: 'Acme', email: 'nope' } }))
      .rejects.toMatchObject({ statusCode: 422, data: { errors: { email: expect.any(Array) } } })

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
      .rejects.toMatchObject({ statusCode: 500 })

    // Nothing was collected on the way out.
    await expect($fetch('/api/eponyme-forms/newsletter/submissions', authenticated()))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('rate-limits a custom route that opts in, the way the managed endpoint does', async () => {
    const limit = 20
    const post = () => $fetch('/throttled', { method: 'POST', body: { email: 'ada@example.com' } })

    for (let attempt = 0; attempt < limit; attempt++)
      await expect(post()).resolves.toMatchObject({ accepted: true })

    // Refused rather than merely counted, and carrying what a client needs to back off.
    const refused = await post().catch((error: { statusCode: number, response: Response }) => error)
    expect(refused).toMatchObject({ statusCode: 429 })
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

    await expect($fetch('/api/eponyme-forms/contact/submissions')).rejects.toMatchObject({ statusCode: 401 })
    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`)).rejects.toMatchObject({ statusCode: 401 })

    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`, authenticated()))
      .resolves.toMatchObject({ submission: { id: target.id } })
    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`, { method: 'DELETE', ...authenticated() }))
      .resolves.toEqual({ deleted: true })
    await expect($fetch(`/api/eponyme-forms/contact/submissions/${target.id}`, authenticated()))
      .rejects.toMatchObject({ statusCode: 404 })
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
      .rejects.toMatchObject({ statusCode: 401 })
    await expect($fetch('/api/eponyme-forms/contact/submissions', { method: 'DELETE', ...authenticated() }))
      .resolves.toEqual({ deleted: before.total })

    await expect($fetch<{ total: number }>('/api/eponyme-forms/contact/submissions', authenticated()))
      .resolves.toMatchObject({ total: 0 })

    // Clearing is scoped to the submissions path, never to the form itself.
    await expect($fetch('/api/eponyme-forms/contact', { method: 'DELETE', ...authenticated() }))
      .rejects.toMatchObject({ statusCode: 404 })
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

  it('exports the content and imports it back, with import reserved to owners', async () => {
    await $fetch('/api/eponyme-collections/articles', {
      method: 'POST',
      body: { title: 'Export round trip', excerpt: 'Written on dev' },
      ...authenticated(),
    })

    const file = await $fetch<EponymeExportFile>('/api/eponyme-export', authenticated())
    expect(file.eponyme.format).toBe(1)
    // Forms own their submissions, so they are not part of a content export.
    expect(Object.keys(file.eponyme.schemas).sort()).toEqual(['articles', 'pages/homepage'])
    expect(file.entries.map(entry => entry.name)).toContain('articles/export-round-trip')

    // Simulate the target environment drifting, then bring it back with the file.
    await $fetch('/api/eponyme/articles/export-round-trip', {
      method: 'PATCH',
      body: { excerpt: 'Overwritten in production' },
      ...authenticated(),
    })
    await expect($fetch('/api/eponyme-import', {
      method: 'POST',
      query: { dryRun: 1 },
      body: file,
      ...authenticated(),
    })).resolves.toMatchObject({ dryRun: true, created: 0, skipped: [] })
    await expect($fetch('/api/eponyme-import', { method: 'POST', body: file, ...authenticated() }))
      .resolves.toMatchObject({ dryRun: false, skipped: [] })
    await expect($fetch('/api/eponyme/articles/export-round-trip', {
      query: { version: 'draft' },
      ...authenticated(),
    })).resolves.toMatchObject({ data: { excerpt: 'Written on dev' } })

    // A divergent schema is refused as a whole, and names what diverged.
    const tampered = { ...file, eponyme: { ...file.eponyme, schemas: { ...file.eponyme.schemas, articles: 'not-the-same-schema' } } }
    await expect($fetch('/api/eponyme-import', { method: 'POST', body: tampered, ...authenticated() }))
      .rejects.toMatchObject({ statusCode: 409, data: { data: { schemaMismatch: ['articles'] } } })

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
      await $fetch('/api/eponyme/articles/tagged-entry?action=publish', {
        method: 'PATCH',
        body: { title: 'Tagged entry', slug: 'tagged-entry' },
        ...authenticated(),
      })

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
})
