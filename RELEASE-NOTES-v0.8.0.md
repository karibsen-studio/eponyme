> **Requires a migration.** Content moves out of the `data` JSONB column into `draft`,
> `published`, `status` and `publishedAt`. The migration is irreversible and needs a
> stop / migrate / start, not a rolling deploy. Take an export (`GET /api/eponyme-export`)
> before applying it, and add the `EponymeEntryIndex` and `EponymeIndexState` models to your
> Prisma schema.

🚀 Enhancements

* Add `field.tags()` with suggestions, free entry and case-folded duplicates (#8)
* Filter a collection listing with `where`, typed from each field (#10)
* Support `in`, `not`, `contains`, `gte`, `lte`, `gt` and `lt` in a filter (#10)
* Rebuild the filterable index at startup when the configuration that produced it changed (#10)
* Add the `autoReindex` option and the auto-imported `reindexEponymeEntries()` (#10)

🩹 Fixes

* Write an entry, its history version and its index in one transaction (#10)
* Document the `EponymeEntryIndex` and `EponymeIndexState` models in the Prisma schema (#10)

⚡ Performance

* Store `draft`, `published`, `status` and `publishedAt` in columns, so `take`, `skip` and the total run in `SQL` (#10)
* Read only the `published` column for a public listing, never the draft one (#10)
* Build the sitemap without reading any entry payload (#10)

💅 Refactors

* Generalise phone normalisation into `normalizeEponymeValues()` (#8)

📚 Documentation

* Document `autoReindex` and the filterable index (#10)

❤️ Contributors

* Corentin Nelhomme (`@d3ller`)
