# Changelog

## Unreleased

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.8.13...HEAD)

### 🚀 Enhancements

* Add project-defined leaf fields discovered from `eponyme/fields`, with generated Vue, runtime and TypeScript registries
* Add build-time locale catalogues and let host applications provide translated dashboard messages
* Add unpublication, return-to-draft actions, UTC publication scheduling and per-content publication controls
* Add `field.money()`, `field.datetime()`, `field.duration()`, `field.masked()`, `field.seo()`, `field.file()` and `field.relation()`
* Add `defineBlock()` for reusable groups of fields that expand to regular sections
* Add configurable file storage, a media library, local development storage and the `@eponyme/storage` S3, R2 and GCS drivers
* Validate relation targets when saving and index references from drafts and published content at every schema depth
* Add text alignment, text color, highlights, selection controls and a full-screen mode to the rich-text editor
* Let public custom routes store form submissions with the same validation, quotas and rate limits as managed forms
* Add server-side submission search, row selection and grouped deletion to the form dashboard
* Add entry duplication and improve long arrays with generated item labels, collapsing and search
* Add light and dark dashboard themes, a profile menu and mobile bottom sheets
* Add searchable collection filters for the supported indexed field types

### 🩹 Fixes

* Restrict `ep-light` and `ep-dark` to `dashboardPath`, including the early bootstrap script, and remove them after leaving the dashboard
* Return translated server errors in the JSON `message` field and read that field consistently in the dashboard
* Use H3's `status` option instead of the deprecated `statusCode` alias when creating errors
* Refuse role or status changes to the signed-in account and keep the last-owner protection message visible
* Refuse to save a relation whose target does not exist or to trash an entry that live content still references
* Sanitize rich text on every write path and preserve alignment, text color and highlights after saving
* Await cache invalidation before a write returns
* Rebuild the collection index when a newly supported field becomes filterable
* Keep date and datetime inputs at their intended size on iOS and expose history actions on touch screens
* Truncate long preview-version labels and keep submission results visible while a search is running
* Drop the PostgreSQL pattern index only when it exists

### 🔒 Security

* Add shared request rate limiting, managed-form quotas and bounded request bodies
* Bound passwords before passing them to `scrypt` and remove account locking that could be abused for denial of service
* Resolve configuration keys without traversing the object prototype chain
* Keep media routes authenticated and constrain every local or remote object key to the configured upload prefix

### ⚡ Performance

* Load heavy dashboard pages and field components only when they are used
* Share content caching through a Nitro storage mount and tag public routes for targeted invalidation
* Keep relation lookups in the typed entry index instead of scanning content payloads

### 📦 Build

* Upgrade the playground to Prisma 7 with its PostgreSQL driver adapter
* Pre-bundle the dashboard dependencies that otherwise reach the browser as raw CommonJS
* Pin `sanitize-html` to the last release whose dependency graph works in the deployed CommonJS server bundle
* Add Redis-backed integration coverage to CI and expand the module, CLI and storage test suites
* Add the scheduled-publication columns and relation index changes required by the new runtime contracts

### 📚 Documentation

* Document fields, blocks, relations, storage, locales, caching and the editorial lifecycle
* Add issue and pull-request templates and link the documentation site to Discord

## v0.8.13

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.8.12...v0.8.13)

### 🩹 Fixes

* Pre-bundle the dashboard client dependencies so CommonJS packages load correctly in host applications (11273a0)

### 💅 Refactors

* Align the module on `extendViteConfig`, `pathe` and an explicit Nuxt compatibility range (7184d61)
* Declare the private runtime config once instead of asserting its shape at every call site (ed8b45f)

### ❤️ Contributors

* C.Nelhomme (`@D3ller`)

## v0.8.12

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.8.11...v0.8.12)

### 🩹 Fixes

* Resolve `defineEponymeConfig`, `collection`, `form` and `defineEponymeVariables` from the built entry so published auto-imports work (4eb85c8)

### ❤️ Contributors

* C.Nelhomme (`@D3ller`)

## v0.8.11

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.8.1...v0.8.11)

### 🚀 Enhancements

* Add `field.mediaPlayer()` for YouTube, Vimeo and direct media files (bc64480)

### ❤️ Contributors

* C.Nelhomme (`@D3ller`)

## v0.8.1

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.8.0...v0.8.1)

### 🚀 Enhancements

* Highlight content variables inside the rich-text editor (5a59111)
* Add an alert dialog for destructive confirmations (2aca582)

### 💅 Refactors

* Drop the redundant eyebrow above the dashboard page title (eb8fa9d)

### 📦 Build

* Add `@tiptap/pm` and pin `@karibsen/ui` (30351f3)

### ❤️ Contributors

* Corentin Nelhomme (`@d3ller`)

## v0.8.0

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.7.0...v0.8.0)

> **Requires a migration.** Content moves out of the `data` JSONB column into `draft`,
> `published`, `status` and `publishedAt`. The migration is irreversible and requires a
> stop, migrate and start deployment. Export the content before applying it, then add the
> `EponymeEntryIndex` and `EponymeIndexState` models to the Prisma schema.

### 🚀 Enhancements

* Add `field.tags()` with suggestions, free entry and case-folded duplicates (fa1a4e7)
* Filter and paginate collection listings in the database with typed `where` operators (f32d2f1)
* Rebuild the filterable index at startup when its configuration changes (f32d2f1)
* Add the `autoReindex` option and auto-imported `reindexEponymeEntries()` helper (f32d2f1)

### 🩹 Fixes

* Write an entry, its history version and its index in one transaction (f32d2f1)
* Document the `EponymeEntryIndex` and `EponymeIndexState` models in the Prisma schema (f32d2f1)

### ⚡ Performance

* Store `draft`, `published`, `status` and `publishedAt` in dedicated columns (f32d2f1)
* Read only published payloads from public collection listings (f32d2f1)
* Build the sitemap without reading entry payloads (f32d2f1)

### 💅 Refactors

* Generalize phone normalization into `normalizeEponymeValues()` (fa1a4e7)

### 📚 Documentation

* Add the documentation site and document collection filtering, indexing and `autoReindex` (67c650f, 921b26c)

### ❤️ Contributors

* Corentin Nelhomme (`@d3ller`)

## v0.7.0

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.6.0...v0.7.0)

### 🚀 Enhancements

* Add `field.phone()`, stored in E.164 and restricted to the countries you accept (72fd194)
* Let `field.url()` restrict the protocols an external link may use (e7eedfc)
* Remove the `url` and `email` flags from text field options (breaking) (e7eedfc)
* Remove captcha support and its adapter (breaking) (cd17e74)
* Warn at build time when `@nuxt/ui` is older than `4.10.0` (ee555f5)
* Show the Eponyme logo in the dashboard sidebar (ccc9612)
* Shorten a long href in the link editor (8d8e31f)

### 🩹 Fixes

* Fill in the defaults of fields nested in a section, a tab or an array item (c342ce3)

### 💅 Refactors

* Extract `middleEllipsis` into a shared util (8dd9e76)
* Drop redundant classes on the submissions table header (c83f21e)

### 📦 Build

* Add `libphonenumber-js` (6ab2d38)
* Ignore the local template and guideline files (675b886)

### 📚 Documentation

* Document `ModuleOptions` with its defaults and examples (9b3f047)
* Add a cover image to the readme (5922b96)

### ❤️ Contributors

* Corentin Nelhomme (`@d3ller`)

## v0.6.0

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.5.0...v0.6.0)

### 🚀 Enhancements

* Tag the public routes declared in `previewPaths`, so purging on publication drops the HTML as well as the JSON (42eb7db)
* Give the dashboard its own favicon and login mark (8525747)

### 🩹 Fixes

* Keep `useEponyme()` data typed in the published declarations, where `typeof eponymeConfig` was lost (42eb7db)
* Never render an unpublished version into the HTML of a public route, which a cache would replay to anonymous visitors (42eb7db)
* Answer `Cache-Control: no-store` to any request carrying `?__eponyme_preview=` (42eb7db)

### ⚡ Performance

* Reuse published content from Nuxt payloads instead of refetching it on every client navigation (42eb7db)

### ❤️ Contributors

* Corentin (`@d3ller`)
