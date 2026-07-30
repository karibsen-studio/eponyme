# Changelog


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
