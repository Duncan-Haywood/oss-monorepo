# Polish 2026-10-28: shorter `/compare/<product>/` titles

**Weak surface.** The previous polish report (`polish-2026-10-28-site-title-suffix.md`) listed 46
`/compare/` pages whose generated title was long even without the site-name suffix, e.g. "assembling
one by hand in a document editor alternatives: 2 free tools with a side-by-side page" (83 characters).

**Fix.** `renderCompareProductPage` in `platform/pages/build.mjs` now titles the page
`<subject> alternatives: <n> free tool(s)`, 24 characters shorter. The "side-by-side page" phrase was
already in the description and the `h1`. Test: `build.test.mjs`, "renderCompareProductPage ...".
`siteTitle()` still adds the site name where the result fits 70 characters.

**Not measured:** rankings, traffic. Count of over-budget titles before/after is from the next full build.

**Still weakest.** ~570 blog headlines over 70 characters (an optional `seo_title:` front-matter field
would fix them at writing time); 45 research titles with a ` (research/<slug>)` disambiguator;
`platform/marketing/front-door.mjs:1646` has the same long phrase for the marketing copy of the page.
