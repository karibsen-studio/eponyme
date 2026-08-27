🚀 Enhancements

* Add `field.seo()`, a preset built on `field.section()`, with `resolveEponymeSeo()` deriving the sharing values on read (#53)
* Split camel case in generated labels, so `productionPhoto` reads as `Production Photo` (#53)
* Keep the sidebar mounted across navigations, instead of remounting it and refetching statuses on every page (#53)
* Let a tab group drop its top rule, like a section already could (#53)

🩹 Fixes

* Send refusal messages through `statusMessage`, so the dashboard shows them instead of a generic wording (#53)
* Load the DiceBear style without a JSON import attribute, which the browser rejects on a bundler-transformed module (#53)
* Raise the `EPSelect` menu to the z-index of every other portal, so it no longer opens behind a dialog (#53)
* Restore the border and focus ring on text inputs, which `border-0` was cancelling (#53)

💅 Refactors

* Name the design tokens by role, and declare each one once instead of letting an unlayered `:root` block override `@theme` (#53)

❤️ Contributors

* C.Nelhomme (`@D3ller`)
