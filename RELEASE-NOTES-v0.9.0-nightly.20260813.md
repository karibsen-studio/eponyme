🚀 Enhancements

* Search submissions from the form page, server-side and case-insensitive, across the whole pager rather than the rows on screen (#55)
* Align paragraphs and headings left, centre or right from the rich text toolbar (#55)

🩹 Fixes

* Pin `sanitize-html` to `2.17.5`, which keeps a `htmlparser2` that still ships a CommonJS entry point – `2.17.6` moved to an ESM-only one and crashed the deployed function with `ERR_REQUIRE_ESM` (#55)
* Refuse to change the role or the status of your own account, which deleted your own sessions and locked you out on the spot (#55)
* Allow `text-align` through the rich text sanitiser, without which an alignment showed in the editor and disappeared on save (#55)
* Keep the submissions table and its search in place while a query is in flight, instead of emptying both on every keystroke (#55)

📦 Build

* Declare `@tiptap/extension-text-align` as a pre-bundled client dependency, so the toolbar loads in development (#55)

📚 Documentation

* Add the Discord link to the documentation site (#55)

❤️ Contributors

* C.Nelhomme (`@D3ller`)
