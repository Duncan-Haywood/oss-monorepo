---
kind: polish
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: built-site SEO sweep finds no real defect

**Checked.** Full `node platform/pages/build.mjs` (about 10 minutes in a cloud session), then `node platform/pages/check.mjs`: 1331 products, 45 category pages, 7651 pages, no dead links. A scan of the 5407 `index.html` pages in dist: no missing `<title>`, no duplicate titles, no missing meta description.

**False positives to skip next time** (each looked like a defect and was not):
- *Titles over 70 characters (607 pages).* The enforced limit is `MAX_TITLE_LENGTH = 130` in `platform/pages/page-identity.mjs`; 70 was my own threshold. Shortening for SERP truncation (about 60 characters) is a taste call, not a failure.
- *Descriptions over 160 characters (261 pages).* Measured on the escaped HTML: `&#39;` counts as 5 characters. `writing.mjs` enforces 160 on the raw text, and the sampled posts pass.
- *Two to three `<h1>` on page-seo-audit, structured-data-drift-check, affiliate-disclosure-checker, shift-roster-builder.* The extra ones are sample markup inside `<script>` template strings; `h1Count` in `page-identity.mjs` already strips those.

**Not done.** The earlier "Next" (move the pasted `mobile-overflow-guard` snippet, now in 60 venture pages in two variants, into shared chrome) is not a safe mechanical edit: 29 pages carry only `table{position:relative;display:block;max-width:100%;overflow-x:auto}`, and `display:block` on every table in the shared sheet would change layouts. It needs a per-page screenshot comparison. Visual sweeps of blog posts and flagships are also still open. No ranking or traffic claim.
