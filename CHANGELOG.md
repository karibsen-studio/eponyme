# Changelog


## v0.7.0

[compare changes](https://github.com/karibsen-studio/eponyme/compare/v0.6.0...v0.7.0)

### 🚀 Enhancements

* Add `field.phone()`, stored in E.164 and restricted to the countries you accept (72fd194)
* Let `field.url()` restrict the protocols an external link may use (e7eedfc)
* Remove the `url` and `email` flags from text field options — breaking (e7eedfc)
* Remove captcha support and its adapter — breaking (cd17e74)
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
