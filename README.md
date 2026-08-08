![Eponyme cover](https://raw.githubusercontent.com/karibsen-studio/eponyme/main/.github/assets/cover.png)

# Eponyme

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

A type-safe content manager made for Nuxt.

Define your content in `eponyme.config.ts`. Eponyme provides defaults, validation, PostgreSQL persistence, a server API, and a generated dashboard.

## Features

- Type-safe fields for text, slugs, rich text, numbers, booleans, images, links, phone numbers, tags, dates, colors, sections, tabs, and arrays
- Declarative defaults and validation
- Conditional fields, character counters, and sortable arrays
- Private drafts with explicit publishing
- Collections for articles, pages, and other repeatable content, with sorting, limiting and pagination
- Public forms with typed schemas, server-side validation, and stored submissions
- Content variables such as `{{ currentYear }}`, resolved when the page is served
- Persistent version history with dashboard restoration
- Draft previews for configured public routes
- A general sitemap metadata endpoint for configured public routes
- Content export and import between environments, guarded by a schema fingerprint
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

Eponyme brings its own components, so `@nuxt/ui` is not required. If your application does use
it, it has to be `^4.10.0` or newer: both ship Tailwind, and an older `@nuxt/ui` resolves a
version the dashboard was not built against. What that breaks is not predictable — broken
dashboard styles are the visible case, but it can also fail the build or misbehave elsewhere with
no obvious link back to the cause. The module checks the installed version and warns at build
time.

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
    contactPhone: field.phone({
      label: 'Contact phone',
      defaultCountry: 'FR',
      countries: ['FR', 'BE'],
      autocomplete: 'tel',
    }),
    callToAction: field.url({
      label: 'Call to action',
      // Schemes an external link may use; defaults to ['http', 'https']
      protocols: ['https', 'mailto'],
      defaultValue: {
        href: '/contact',
        type: 'internal',
        openInNewTab: false,
        download: false,
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

### Tags

`field.tags()` holds a short list of values, with suggestions and optional free entry:

```ts
tags: field.tags({
  suggestions: ['Nuxt', 'Vue', 'TypeScript'],
  allowCustom: true,
  maxItems: 5,
})
```

The value type follows the options: closed, it is `('Nuxt' | 'Vue' | 'TypeScript')[]`; with
`allowCustom`, `string[]`. One array never mixes two types.

The list is normalised **on the server** before the write: trimmed, blanks dropped, duplicates
folded case-insensitively. A suggestion imposes its spelling, so typing `nuxt` beside a declared
`Nuxt` yields `Nuxt` and a listing never splits in two. `minItems` and `maxItems` count what is
left after that folding.

### Phone numbers

`field.phone()` stores its value in **E.164** — `+33611131143` — whatever format it was typed
in. Normalisation happens on the server before the write, so the stored format is a guarantee
rather than a convention a client could skip.

```ts
phone: field.phone({
  label: 'Phone',
  // ISO 3166-1 alpha-2, autocompleted from libphonenumber-js
  countries: ['FR', 'BE'],
  // Country a number typed without `+` belongs to
  defaultCountry: 'FR',
  autocomplete: 'tel',
  placeholder: '06 11 13 11 43',
  required: true,
})
```

| Option | Effect |
|---|---|
| `countries` | Countries whose numbers are accepted. A number resolving to any other is refused, with an error naming the country it came from. Omitted, every country is accepted |
| `defaultCountry` | Country assumed for a number written without an international prefix. Without it, only `+…` numbers can be understood |
| `detectCountry` | `false` requires the international `+…` form, so the country is never guessed. Defaults to `true` |
| `autocomplete` | `tel`, `tel-national` or `tel-country-code`, set on the input |
| `defaultValue`, `required`, `placeholder`, `label`, `description` | As on every field |

Validation uses the `min` metadata bundle of `libphonenumber-js`, a fraction of the size of the
full one. It parses and formats every country, and is slightly more permissive: a few numbers
that are impossible for their region still pass.

A phone field is also allowed in a public `form()`.

## Prisma

Eponyme uses the Prisma client owned by your application. It does not create the connection or run migrations.

Install Prisma 7 and its PostgreSQL driver adapter:

```bash
pnpm add @prisma/client@latest @prisma/adapter-pg@latest
pnpm add --save-dev prisma@latest dotenv@latest
```

Generate the client outside `node_modules` and keep the connection URL in Prisma Config:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

```ts
// prisma.config.ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

Export an initialized client from the path configured in `nuxt.config.ts`. Note the
double tilde: `~~/` points at the project root, where `server/` lives, while `~/` points
at the source directory (`app/` in Nuxt 4). A relative path such as
`./server/utils/prisma` works too.

```ts
// server/utils/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

const prismaGlobal = globalThis as typeof globalThis & { prisma?: PrismaClient }

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString)
    throw new Error('DATABASE_URL is required to initialise Prisma.')

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
}

const prisma = prismaGlobal.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production')
  prismaGlobal.prisma = prisma

export default prisma
```

Install the published Eponyme CLI, then let it add the required models and immutable migration
history to your application:

```bash
pnpm add --save-dev @eponyme/cli
pnpm exec eponyme init
pnpm prisma migrate deploy
pnpm prisma generate
pnpm exec eponyme check --client server/utils/prisma.ts
```

`eponyme init` only writes the host Prisma schema and migration files; it never connects to the
database. `eponyme check` is read-only and verifies the generated PrismaClient, PostgreSQL tables,
columns and the Eponyme schema version. The generated models are shown below for reference:

```prisma
model Eponyme {
  name        String    @id
  draft       Json      @db.JsonB
  published   Json      @db.JsonB
  status      String
  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  versions    EponymeVersion[]
  index       EponymeEntryIndex[]

  @@index([deletedAt])
  @@index([publishedAt])
  @@map("eponyme_entries")
}

/// Filterable values pulled out of the content columns, so a listing can look them up
/// instead of loading and normalizing every entry of a collection to compare them.
/// Rewritten for an entry inside the same transaction as the write that changed it.
model EponymeEntryIndex {
  entryName String
  /// "draft" or "published": the two disagree, and a public listing must only see one.
  version   String
  key       String
  /// Case-folded, so a lookup never has to guess which spelling was stored first.
  value     String
  entry     Eponyme @relation(fields: [entryName], references: [name], onDelete: Cascade)

  @@id([entryName, version, key, value])
  @@index([key, version, value])
  @@map("eponyme_entry_index")
}

/// Remembers which filterable schema each collection was last indexed against, so the
/// module can rebuild only what a config change actually invalidated.
model EponymeIndexState {
  name        String   @id
  fingerprint String
  updatedAt   DateTime @updatedAt

  @@map("eponyme_index_state")
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

model EponymeRateLimit {
  key       String   @id
  count     Int
  expiresAt DateTime

  @@index([expiresAt])
  @@map("eponyme_rate_limits")
}

model EponymeSchema {
  key       String   @id @default("eponyme")
  version   Int
  updatedAt DateTime @updatedAt

  @@map("_eponyme_schema")
}
```

Keep the generated migrations in source control. On an upgrade, run `eponyme init` again, inspect
the newly copied migrations, deploy them, regenerate Prisma and finish with `eponyme check`.

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

### Trash

Deleting a collection entry moves it to a trash rather than destroying it. The entry
disappears from the dashboard, from the public API and from the sitemap, but its content
and its whole version history are kept, so it can be brought back.

The collection page lists the trash behind a **Trash** button and offers **Restore** and
**Delete for good**. Restoring is available to editors and owners; deleting for good is
reserved to owners, since it is the only irreversible content operation — the entry's
history goes with it.

```http
GET    /api/eponyme-trash/articles                 # trashed entries of a collection
PATCH  /api/eponyme-trash/articles/my-article      # restore
DELETE /api/eponyme-trash/articles/my-article      # delete for good, owner only
```

A trashed entry keeps its row, so it keeps its slug. Creating an entry with that slug is
refused with a message pointing at the trash rather than silently overwriting what is
waiting there. Restore the entry or delete it for good to free its slug.

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

### Export and import

The dashboard overview at `/__eponyme` carries **Export** and **Import**, so content
prepared on one environment can be moved to another instead of being retyped.

Export downloads a JSON file holding every singleton and every live collection entry
with its complete state — draft, published version, status and publication date — plus a
fingerprint of the schema each entry was written against. The trash, form submissions and
users are never part of it.

Import applies that file on top of the current content: each entry it carries overwrites
its counterpart, entries it does not mention are left untouched, and nothing is ever
deleted. Before the first write, the fingerprints are compared with the local
configuration; a single divergence refuses the whole file and names what diverged, so an
import can never land half of its entries into a schema that no longer matches. The
dashboard first runs the import as a dry run and shows what it would create, overwrite
and skip. An entry whose slug waits in the trash is skipped rather than resurrected.

Every imported entry is written to the version history, so an import stays reversible
entry by entry from the timeline.

```http
GET  /api/eponyme-export             # editors and owners
POST /api/eponyme-import             # owners only
POST /api/eponyme-import?dryRun=1    # report the counts without writing
```

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

## Caching

Published content is the same for every visitor, so it is cached at three levels. The
defaults suit a content site and can be tuned or switched off:

```ts
export default defineNuxtConfig({
  eponyme: {
    prismaClient: '~~/server/utils/prisma',
    cacheSeconds: 5,          // server instance
    browserCacheSeconds: 30,  // visitor's browser
    cdnCacheSeconds: 300,     // CDN or edge
  },
})
```

| Option | Who holds the copy | Purgeable |
|---|---|---|
| `cacheSeconds` | The server instance, in memory | Yes — cleared on every write |
| `browserCacheSeconds` | The visitor's browser | **No** |
| `cdnCacheSeconds` | The CDN | Yes — see below |

`browserCacheSeconds` is what makes a client-side navigation instant: the browser answers
from its own cache instead of crossing the network. It is also the one window nobody can
shorten. A visitor holding a copy keeps it until it expires, publication or not, which is
why the default is deliberately small. Set it to `0` if a publication must be visible
immediately to everyone; navigation then costs a round trip again.

### Purging the CDN

The CDN window can be long because it can be purged. CDNs purge by **tag** rather than by
URL — one entry appears in several cached responses, its own and its collection's listing —
so every cacheable response carries `Vercel-Cache-Tag` and `Cache-Tag`:

| Response | Tags |
|---|---|
| `pages/homepage` | `eponyme`, `eponyme:pages/homepage` |
| `articles/my-article` | `eponyme`, `eponyme:articles/my-article`, `eponyme:articles` |
| The `articles` listing | `eponyme`, `eponyme:articles` |

`getEponymeCacheTags()` returns exactly those tags and is auto-imported into server code,
so a listener purges precisely what the responses were tagged with. On Vercel:

```ts
// server/plugins/purge.ts
import { invalidateByTag } from '@vercel/functions'

export default defineNitroPlugin((nitroApp) => {
  const purge = async ({ name, collection }: { name: string, collection?: { name: string } }) => {
    if (!import.meta.env.VERCEL) return
    await invalidateByTag(getEponymeCacheTags(name, collection)).catch(() => {})
  }

  nitroApp.hooks.hook('eponyme:entry:published', purge)
  nitroApp.hooks.hook('eponyme:entry:restored', purge)
  nitroApp.hooks.hook('eponyme:entry:trashed', purge)
  nitroApp.hooks.hook('eponyme:entry:untrashed', purge)
  nitroApp.hooks.hook('eponyme:entry:purged', purge)
})
```

Invalidating marks the entry stale and revalidates in the background, so no visitor waits
for it. A failed purge is swallowed: a CDN that cannot be reached must not turn a
successful publication into an error the editor cannot act on. The worst case is the
content appearing when `cdnCacheSeconds` expires on its own.

**Only published content is ever cached.** Drafts, historical versions, `raw=1` reads,
submissions, the trash, the user list and the session route all answer `no-store`. That is
enforced by a server middleware that marks every Eponyme route uncacheable, which the few
public ones override — so a route added later is private until someone decides otherwise,
rather than public until someone remembers.

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

Rate limiting and file uploads are not implemented yet.

## Hooks

Eponyme emits Nitro hooks around every content write and form submission. Listen to
them from a server plugin:

```ts
// server/plugins/eponyme.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('eponyme:entry:published', async ({ name, collection, data }) => {
    await purgeCdnCache(collection ? `/${collection.name}/${collection.slug}` : `/${name}`)
  })

  nitroApp.hooks.hook('eponyme:form:submitted', async ({ form, data, id }) => {
    if (form === 'contact') await sendEmail(data)
  })
})
```

| Hook | When |
|---|---|
| `eponyme:entry:beforeSave` | Before a draft save or a publication |
| `eponyme:entry:saved` | After a draft save |
| `eponyme:entry:published` | After a publication |
| `eponyme:entry:restored` | After a history version was restored |
| `eponyme:entry:trashed` | After a collection entry was moved to the trash |
| `eponyme:entry:untrashed` | After a collection entry was taken back out of the trash |
| `eponyme:entry:purged` | After a collection entry and its history were deleted for good |
| `eponyme:form:beforeSubmit` | Before a managed submission is stored |
| `eponyme:form:submitted` | After a managed submission was stored |

The `before` hooks can **reject or amend** the operation. Throwing rejects it with a
`422` carrying your message, which is the way to enforce a rule the schema cannot
express. Mutating `context.data` changes what gets written:

```ts
nitroApp.hooks.hook('eponyme:entry:beforeSave', ({ data, collection }) => {
  if (collection?.name === 'articles' && !data.excerpt) throw new Error('An excerpt is required.')
  data.updatedBy = 'automation'
})
```

`eponyme:form:beforeSubmit` runs **after** validation, so a listener never sees a
payload the schema would have rejected.

The other hooks are notifications: the write already happened, so a listener that
throws is logged and swallowed. A failing webhook must not report a successful save as
an error the editor cannot act on.

Entries belonging to a collection carry `collection: { name, slug }`, so a listener can
branch without re-parsing the entry name. The three trash hooks only ever concern
collection entries, so their `collection` is always present; they carry no content, since
a trash move leaves the entry itself untouched.

## Current status

Eponyme is at version `0.5.0`. It is ready for controlled projects and production pilots. A few workflows still need hardening before a broad public release:

- Client revision tokens for long-running concurrent edits: the current `updatedAt` check protects overlapping writes within one request, not two editors who loaded the same older revision. A deletion is not guarded by a revision either
- Retention controls for the trash: entries stay there until someone empties it
- Rate limiting and file uploads for public forms
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
