🚀 Enhancements

* Add `field.masked()`, a preset built on `field.string()` that derives its validation `regex` from the mask (#54)
* Add a `publication` option, a boolean or a per-name record, letting an entry drop the publication tab while keeping publish and draft (#54)
* Let a collection override `publication` for its own entries (#54)
* Replace the centered dialog with a bottom sheet on mobile, with drag to dismiss (#54)
* Add a sidebar profile menu that switches between the light and dark themes (#54)

🩹 Fixes

* Keep `date` and `datetime-local` inputs at their declared width and height on iOS, where WebKit ignored `width: 100%` (#54)
* Show the history button on mobile, where the hover reveal never fired (#54)
* Send the remaining hardcoded messages through the locale catalogue (#54)
* Refuse `schedule`, `unpublish` and `revertToDraft` on an entry whose publication tab is disabled (#54)
* Show the server reason when a sign-in fails, instead of a generic wording (#54)
* Truncate long labels in the preview version picker (#54)

📦 Build

* Declare `maska/vue` as a pre-bundled client dependency, so the masked input loads in development (#54)

📚 Documentation

* Document the `publication` option and how to turn the publication tab off (#54)

❤️ Contributors

* C.Nelhomme (`@D3ller`)
