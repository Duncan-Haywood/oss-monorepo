# Polish 2026-10-28: the site-name suffix only when the title still fits

**Weak surface.** A scan of the built site (3,453 `index.html`) found 967 titles over 70 characters, the
width a results page shows. Beyond blog headlines (kept whole on purpose, see `postPageTitle`), the
templated pages were the cause: `/compare/<product>/` ("assembling one by hand in a document editor
alternatives: 2 free tools with a side-by-side page | Open Tools and Research", 121 characters) and the
audience hubs `/c/<audience>/` (up to 86). The fixed ` | Open Tools and Research` suffix pushed the
words that say what the page is toward, or past, the cut.

**Fix.** `siteTitle(title)` in `platform/pages/site-nav.mjs` (with `TITLE_BUDGET` = 70, moved there from
`writing.mjs`, which re-exports it) adds the suffix only when the whole title fits; otherwise the title
stands alone. All seven `build.mjs` templates that wrote `${title} | ${SITE_NAME}` call it. Test:
`site-nav.test.mjs` "siteTitle adds the site name only when...".

**Measured** (same scan, before -> after): titles over 70 characters 967 -> 908; longest 122 -> 122 (a
blog headline). No title lost its distinguishing words, and no duplicate titles appeared (`check.mjs`).
Not measured: rankings, traffic, Lighthouse.

**Still weakest / next.**
- 908 titles are still over 70: ~570 blog posts whose headline alone is 70+ (reword the headline's first
  60 characters at writing time, or add an optional `seo_title:` front-matter field), 46 `/compare/` pages
  whose generated phrase is long even without the suffix (`<subject> alternatives: N free tools` would
  fit), 45 research project titles carrying a ` (research/<slug>)` disambiguator.
- `check.mjs` on a fresh build: one dead link in
  `writing/luxembourg-b2b-e-invoicing-bill-8815-status` to
  `ventures/einvoice-preflight/luxembourg-e-invoice-mandate.html` (already on `main`).
