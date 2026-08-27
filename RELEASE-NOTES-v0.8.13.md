🚀 Enhancements

* Add unpublication, return-to-draft actions and UTC publication scheduling
* Add contextual dashboard actions, scheduled-date badges and localized history labels

🩹 Fixes

* Pre-bundle the dashboard's client dependencies, so `slugify` is no longer served as raw CommonJS in a host application (#21)

💅 Refactors

* Align on `extendViteConfig`, `pathe` and a declared Nuxt compatibility range (#21)
* Declare the private runtime config once instead of asserting its shape at each call site (#21)

📦 Build

* Require the nullable `scheduledPublishAt` and `scheduledUnpublishAt` migration before deploying to an existing database; missing columns fail on the first content read rather than at startup

📚 Documentation

* Document the editorial lifecycle, `runEponymeSchedule()` and CDN expiry behavior

❤️ Contributors

* C.Nelhomme (`@D3ller`)
