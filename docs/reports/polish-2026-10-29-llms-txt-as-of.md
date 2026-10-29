# Polish 2026-10-29: an as-of date in every generated llms.txt (AEO)

**Weak surface.** The polish prompt asks answer-first pages to carry an as-of date. The generated
`/<slug>/llms.txt` (1,308 products, `renderProductLlmsTxt`) had none, so an assistant quoting one could not
say how current it was. Of the ten flagships' hand-written files, four also carry no date wording
(einvoice-preflight, shift-roster-builder, photo-editing, open-tennis-robots).

**Change.** `renderProductLlmsTxt` takes `updated` and, when it is a date, ends the file with
`Source last changed: YYYY-MM-DD (from the repository's git history).` The build passes the product
`index.html` date from `loadLastChanged`, so it is the same history the sitemap `<lastmod>` uses and is omitted
(not faked) in a shallow clone that cannot say. Unit test added in `platform/pages/product-llms.test.mjs`.

**Measured.** `node --test platform/pages/product-llms.test.mjs`: 2 pass. Full site build not run in this
session (7 to 20 minutes); CI's build covers it. No citation or traffic effect measured.

**Next.** Add a date line to the four flagship files above; a check that every hand-written `llms.txt` states
a date; point hand-written files' sub-pages at the live URL (wall-framing-takeoff and changepoint-detector list
none besides the placeholder origin).
