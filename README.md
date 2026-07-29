# Eponyme

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

A type-safe content manager made for Nuxt.

Define your content in `eponyme.config.ts`. Eponyme provides defaults, validation, PostgreSQL persistence, a server API, and a generated dashboard.

## Features

- Type-safe fields for text, slugs, rich text, numbers, booleans, images, links, dates, colors, sections, tabs, and arrays
- Declarative defaults and validation
- Conditional fields, character counters, and sortable arrays
- Private drafts with explicit publishing
- Collections for articles, pages, and other repeatable content, with sorting, limiting and pagination
- Public forms with typed schemas, server-side validation, and stored submissions
- Content variables such as `{{ currentYear }}`, resolved when the page is served
- Persistent version history with dashboard restoration
- Draft previews for configured public routes
- A general sitemap metadata endpoint for configured public routes
- A generated dashboard at `/__eponyme`
- Server sessions with `owner`, `editor`, and `viewer` roles
- PostgreSQL and Prisma persistence using JSONB
- Typed composables for entries and collections
- Reusable `EP*` interface primitives

Runtime components follow three clear layers:

- `components/ui` contains reusable `EP*` primitives.
- `components/fields` turns those primitives into complete fields.
- `components/editor` owns the dashboard, navigation, and editing workflows.

## Installation

Install the module:

```bash
pnpm add @karibsen/eponyme
```

Add it to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@karibsen/eponyme'],
  eponyme: {
    prismaClient: '~~/server/utils/prisma',
    dashboardPath: '/__eponyme',
    previewPaths: {
      homepage: '/',
      articles: '/articles/:slug',
    },
    auth: {
      sessionDurationDays: 7,
    },
  },
})
```

Create `eponyme.config.ts` at the root of the application:

```ts
export default defineEponymeConfig({
  homepage: {
    title: field.string({
      label: 'Title',
      required: true,
      defaultValue: 'Welcome',
    }),
    subtitle: field.textarea({
      label: 'Introduction',
      maxLength: 160,
      visibleWhen: { field: 'published', equals: true },
    }),
    body: field.richText({
      label: 'Content',
      placeholder: 'Write your story…',
      required: true,
    }),
    contactEmail: field.email({
      label: 'Contact email',
      defaultValue: 'hello@example.com',
    }),
    callToAction: field.url({
      label: 'Call to action',
      defaultValue: {
        href: '/contact',
        type: 'internal',
        openInNewTab: false,
      },
    }),
    published: field.boolean({
      label: 'Published',
    }),
    launchDate: field.date({
      label: 'Launch date',
      defaultValue: today(),
    }),
    accentColor: field.color({
      label: 'Accent color',
      defaultValue: '#171714',
    }),
    tags: field.array({
      label: 'Tags',
      of: field.string({ required: true }),
      defaultValue: ['nuxt', 'content'],
      minItems: 1,
      maxItems: 5,
      addLabel: 'Add tag',
      itemLabel: 'Tag $i',
    }),
    hero: field.section({
      label: 'Hero',
      fields: {
        title: field.string({ label: 'Title', required: true }),
        introduction: field.textarea({ label: 'Introduction' }),
      },
    }),
    metadata: field.tab({
      label: 'Metadata',
      tabs: {
        seo: {
          label: 'SEO',
          fields: {
            title: field.string({ maxLength: 60 }),
            description: field.textarea({ maxLength: 160 }),
          },
        },
        social: {
          label: 'Social',
          fields: {
            title: field.string({ maxLength: 70 }),
            image: field.image(),
          },
        },
      },
    }),
  },
})
```

Every field accepts a synchronous custom validator:

```ts
field.string({
  validate: (value, data) => value !== data.slug || 'The title must be different from the slug.',
})
```

## Prisma

Eponyme uses the Prisma client owned by your application. It does not create the connection or run migrations.

Export an initialized client from the path configured in `nuxt.config.ts`. Note the
double tilde: `~~/` points at the project root, where `server/` lives, while `~/` points
at the source directory (`app/` in Nuxt 4). A relative path such as
`./server/utils/prisma` works too.

```ts
// server/utils/prisma.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default prisma
```

Add the required models to your Prisma schema:

```prisma
model Eponyme {
  name      String   @id
  data      Json     @db.JsonB
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  versions  EponymeVersion[]

  @@map("eponyme_entries")
}

model EponymeVersion {
  id        Int          @id @default(autoincrement())
  entryName String
  data      Json         @db.JsonB
  action    String
  status    String
  createdAt DateTime     @default(now())
  userId    String?
  entry     Eponyme      @relation(fields: [entryName], references: [name], onDelete: Cascade)
  user      EponymeUser? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([entryName, createdAt])
  @@index([userId])
  @@map("eponyme_versions")
}

model EponymeUser {
  id                  String                @id
  username            String
  usernameNormalized  String                @unique
  passwordHash        String
  role                String
  active              Boolean               @default(true)
  mustChangePassword  Boolean               @default(true)
  failedLoginAttempts Int                   @default(0)
  lockedUntil         DateTime?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt
  sessions            EponymeUserSession[]
  versions            EponymeVersion[]

  @@index([role, active])
  @@map("eponyme_users")
}

model EponymeUserSession {
  id        String      @id
  tokenHash String      @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime    @default(now())
  user      EponymeUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("eponyme_user_sessions")
}

model EponymeFormSubmission {
  id        String   @id
  formName  String
  data      Json     @db.JsonB
  createdAt DateTime @default(now())

  @@index([formName, createdAt])
  @@map("eponyme_form_submissions")
}
```

Run the migration with the workflow used by your application.

The playground includes the same models in `playground/prisma/schema.prisma`. Copy `playground/.env.example` to `playground/.env`, set `DATABASE_URL`, then run:

```bash
pnpm --dir playground prisma:migrate
```

## Dashboard and authentication

The dashboard is available at `/__eponyme` by default. Set `dashboardPath` to use another route.

On the first server start, Eponyme creates an `EponymeOwner` account when no user exists. The temporary password is printed once in the server console. The owner must replace it before accessing the dashboard.

Roles are intentionally small:

- `owner` manages content and users.
- `editor` manages content.
- `viewer` has read-only dashboard access.

## Collections

Use `collection()` for repeatable content:

```ts
export default defineEponymeConfig({
  articles: collection({
    label: 'Articles',
    description: 'Stories published on the site.',
    titleField: 'title',
    slugField: 'slug',
    fields: {
      title: field.string({
        label: 'Title',
        required: true,
      }),
      slug: field.slug({
        label: 'Slug',
        required: true,
      }),
      excerpt: field.textarea({
        label: 'Excerpt',
        maxLength: 220,
      }),
      cover: field.image({
        label: 'Cover',
      }),
      body: field.richText({
        label: 'Content',
        required: true,
      }),
    },
  }),
})
```

Each collection entry has its own draft, publication state, and version history. Eponyme generates the slug when an entry is created, then keeps it immutable to preserve public URLs.

Read published collection content with the typed composables:

```ts
const { entries } = useEponymeCollection('articles')
const { data: response } = useEponymeCollectionEntry('articles', 'my-article')

// entries.value contains published entries only.
// response.value?.data contains the typed article.
```

The public collection endpoint is also available:

```http
GET /api/eponyme-collections/articles
```

It returns published entries by default. Pass `version=draft` from an authenticated request to read dashboard content.

### Sorting and limiting

Collections accept `take`, `skip`, `orderBy` and `order`:

```ts
const { entries, total } = useEponymeCollection('articles', {
  orderBy: 'date',
  order: 'desc',
  take: 4,
})
```

`orderBy` accepts the `updatedAt`, `publishedAt`, `title` and `slug` metadata as well
as **any field of the collection**, which is what lets articles be ordered by their own
date rather than by when they were last edited. The key is typed from the schema, so a
misspelled field fails to compile.

`total` counts every matching entry *before* `take` and `skip`, so it can drive a pager.
Sorting runs after unpublished entries are filtered out, meaning a limit never spends a
slot on an entry that would have been dropped. Entries with a missing or empty value sort
last in both directions. The default order remains `updatedAt` descending.

The same options work over HTTP, where the response is `{ entries, total }`:

```http
GET /api/eponyme-collections/articles?orderBy=date&order=desc&take=4
```

`take` is capped at 200, and an unknown `orderBy` answers `400` with the accepted keys
rather than returning an arbitrary order.

## Entries

`useEponyme()` is auto-imported and infers its data from `eponyme.config.ts`:

```ts
const {
  data,
  pending,
  error,
  errors,
  refresh,
  save,
} = useEponyme('homepage')

await save()
await save({ title: 'A new title' })
```

Public reads use the published version. Request the draft explicitly when building an editing workflow:

```ts
const { data, status, save } = useEponyme('homepage', {
  version: 'draft',
})

await save({ title: 'Work in progress' }, 'draft')
await save(data.value, 'publish')
```

The dashboard uses explicit saves. `Ctrl+S` or `Cmd+S` stores a draft. Publish replaces the public version.

The `errors` ref contains field errors returned with HTTP `422`. Eponyme creates missing singleton rows from configured defaults. It also reconciles stored JSONB data when fields are added or removed from the schema.

## Content variables

Editors can drop `{{ currentYear }}` into any text or rich-text field. Variables are
resolved when the page is served, so a year stays current without anyone re-saving the
content.

The built-ins cover dates: `currentYear`, `nextYear`, `previousYear`, `currentMonth`,
`currentDay`, `today` and `currentDate`.

Add your own in `eponyme.variables.ts` at the project root:

```ts
export default defineEponymeVariables({
  clubName: 'AS Chelles Athlétisme',
  season: {
    label: 'Season',
    description: 'The season spanning two calendar years.',
    value: () => `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  },
})
```

A plain value is fixed; a function is called on every read. Declaring a name that
matches a built-in overrides it. The rich text editor lists every variable behind a
toolbar button, with a preview of what it currently resolves to.

**Names only, never expressions.** `{{ currentYear }}` works, `{{ new Date().getFullYear() }}`
is left as-is. Content comes from the database and is editable from the dashboard, so
evaluating it would grant arbitrary code execution on the server. An unknown name is also
left untouched, so a typo is visible on the page instead of silently deleting text.

The dashboard reads content with `?raw=1` and therefore shows the source form, keeping
variables editable. Public reads receive the resolved values.

## Preview

Map a configured entry to its public route:

```ts
export default defineNuxtConfig({
  eponyme: {
    prismaClient: '~~/server/utils/prisma',
    previewPaths: {
      'homepage': '/',
      'pages/contact': '/contact',
      'articles': '/articles/:slug',
    },
  },
})
```

A singleton is keyed by its exact entry name. A collection is keyed by the collection
name, and its value must contain a `:slug` placeholder. An entry named
`articles/my-article` then previews at `/articles/my-article`. The same mapping drives
the sitemap, so a public route is declared once.

The dashboard adds preview parameters to that route. `useEponyme()` and
`useEponymeCollectionEntry()` detect them and load the selected draft or historical
version. Unpublished content requires an authenticated Eponyme session, so an
anonymous visitor who guesses a preview URL still gets the published content only.

Both composables also accept an explicit version, which bypasses the query parameters:

```ts
const { data } = useEponymeCollectionEntry('articles', slug, { version: 'draft' })
```

## Sitemap

Eponyme exposes all configured public URLs through one endpoint:

```http
GET /api/eponyme-sitemap
```

Singleton entries use their exact `previewPaths` value. Collections use a dynamic `:slug` path:

```ts
export default defineNuxtConfig({
  eponyme: {
    prismaClient: '~~/server/utils/prisma',
    previewPaths: {
      homepage: '/',
      articles: '/articles/:slug',
    },
  },
})
```

The response contains metadata only:

```json
{
  "entries": [
    {
      "loc": "/"
    },
    {
      "loc": "/articles/my-article",
      "lastmod": "2026-07-28T12:00:00.000Z"
    }
  ]
}
```

Only published collection entries are included. Drafts and deleted entries are omitted. `lastmod` is the publication timestamp, so editing a private draft does not change the public sitemap.

Each collection is read with a single query, so the endpoint stays cheap as collections grow.

The same data is available to your own server code through an auto-imported, typed
utility, so a sitemap integration never has to make an internal HTTP request:

```ts
// server/routes/sitemap.xml.ts
export default defineEventHandler(async (event) => {
  const entries = await getEponymeSitemapEntries()
  setHeader(event, 'content-type', 'application/xml')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(entry => `  <url><loc>https://example.com${entry.loc}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`
})
```

## Forms

Use `form()` for public forms. A form owns a schema, its own routes and its anti-abuse
rules, so it is a top-level primitive rather than a field value:

```ts
export default defineEponymeConfig({
  contact: form({
    label: 'Contact',
    fields: {
      name: field.string({ label: 'Name', required: true }),
      email: field.email({ label: 'Email', required: true }),
      message: field.textarea({ label: 'Message', required: true }),
    },
    submission: { mode: 'managed' },
  }),
})
```

A form only accepts field types a visitor can fill in: `string`, `textarea`, `email`,
`url`, `number`, `boolean`, `select`, `radio` and `checkboxGroup`. Authoring types such as
`richText`, `image`, `slug`, `date`, `color`, `array`, `section` and `tabs` are rejected at
configuration time.

### Submission modes

`custom` is the default, so a form never writes to the database unless you ask for it.

- `custom`: Eponyme provides the schema, the validation and the data; your application
  owns delivery — an API route, an email service, a webhook, your own table.
- `managed`: Eponyme validates, stores the submission, and lists it in the dashboard.

The configured mode decides what `submit()` does, not the presence of a callback, so the
behaviour stays readable from `eponyme.config.ts` alone.

### Rendering a form

`useEponymeForm()` renders nothing: your application owns the markup, so a public page
never inherits the dashboard styling or its editor dependencies.

```vue
<script setup lang="ts">
const { fields, errors, honeypot, pending, submitted, submit } = useEponymeForm('contact')
</script>

<template>
  <p v-if="submitted">Thanks, your message was received.</p>
  <form v-else novalidate @submit.prevent="submit">
    <div v-for="entry in fields" :key="entry.name">
      <label :for="entry.name">{{ entry.label }}</label>
      <input
        :id="entry.name"
        :value="entry.value"
        @input="entry.update(($event.target as HTMLInputElement).value)"
      >
      <span v-for="message in entry.errors" :key="message">{{ message }}</span>
    </div>
    <!-- Trap field: a human never sees it, a bot fills it in. -->
    <input v-if="honeypot" :name="honeypot" tabindex="-1" autocomplete="off" hidden>
    <button type="submit" :disabled="pending">Send</button>
  </form>
</template>
```

For a `custom` form, pass the handler that delivers the data:

```ts
const { submit } = useEponymeForm('contact', {
  async onSubmit(data) {
    await $fetch('/api/contact', { method: 'POST', body: data })
  },
})
```

### Server-side validation

Client-side validation only improves feedback and is never the security boundary. A
`custom` form posts to your own route, so validate it there with the auto-imported
utility:

```ts
// server/api/contact.post.ts
export default defineEventHandler(async (event) => {
  const result = validateEponymeForm('contact', await readBody(event))
  if (result.errors) {
    setResponseStatus(event, 422)
    return { errors: result.errors }
  }
  await sendEmail(result.data)
  return { delivered: true }
})
```

A `managed` form is validated by Eponyme itself on `POST /api/eponyme-forms/<name>`.

### Submissions and anti-abuse

Managed submissions are listed in the dashboard with sorting, pagination, a detail view
and per-row deletion. Reading them requires a session; deleting requires `editor` or
`owner`.

Two protections apply to the public submission route:

- a **honeypot** field, named `_eponyme_hp` by default. A filled honeypot gets the normal
  success response and stores nothing, so a bot learns nothing from the answer. Set
  `honeypot: false` to disable it, or pass another name.
- a **body size limit**, 64 KB by default, configurable with `maxBodyBytes`. An oversized
  body is refused with `413` before it is parsed.

Rate limiting, CAPTCHA support and file uploads are not implemented yet.

## Current status

Eponyme is at version `0.1.1`. It is ready for controlled projects and production pilots. A few workflows still need hardening before a broad public release:

- Client revision tokens for long-running concurrent edits: the current `updatedAt` check protects overlapping writes within one request, not two editors who loaded the same older revision
- Recoverable deletion: deleting an entry removes it and its history for good
- Rate limiting, CAPTCHA support and file uploads for public forms
- Filtering, export and retention controls for stored submissions
- Pagination or a sitemap index beyond 50,000 URLs

## Development

Install dependencies:

```bash
pnpm install
```

Prepare generated types:

```bash
pnpm dev:prepare
```

Start the playground:

```bash
pnpm dev
```

Run project checks:

```bash
pnpm lint
pnpm test
pnpm test:types
pnpm dev:build
```

Build the package:

```bash
pnpm prepack
```

## License

MIT

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@karibsen/eponyme/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@karibsen/eponyme

[npm-downloads-src]: https://img.shields.io/npm/dm/@karibsen/eponyme.svg
[npm-downloads-href]: https://npm.chart.dev/@karibsen/eponyme

[license-src]: https://img.shields.io/npm/l/@karibsen/eponyme.svg
[license-href]: https://npmjs.com/package/@karibsen/eponyme

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
