---
kind: polish
topics: [seo, tooling]
date: 2026-11-10
---
# Polish 2026-11-10: the build's default origin is the live one

**Why.** Two earlier polish notes from today (`polish-2026-11-10-site-pages-reflow.md`,
`polish-2026-11-10-sideways-sample-pins-indexes.md`) listed it under "next":
`DEFAULT_BASE_URL` in `platform/pages/build.mjs` still named the retired
`https://duncan-haywood.github.io/oss-monorepo/`. The CI deploy sets
`PAGES_BASE_URL=https://marisstella.app/` (portfolio-pages.yml `gate` job), so
production was right. Everything that took the default was wrong:
local builds, `published-base-url.mjs` (which `browser-checks-ci.yml` uses as
the origin `journey.mjs` asserts against), and `pages_state.py`'s
`pages_base_url()`/`indexing_verdict`.

**Measured** (full local build, no `--base`, no `PAGES_BASE_URL`, 8,234 HTML pages):

| | before | after |
|---|---|---|
| canonical tags naming github.io | 8,230 | 0 |
| canonical tags naming marisstella.app | 0 | 8,230 |
| sitemap `<loc>` on github.io / marisstella.app | 9,495 / 0 | 0 / 9,495 |
| pages with an `href` to `github.io/oss-monorepo/` | 8,232 | 0 |
| `robots.txt` Sitemap line | github.io subpath | `https://marisstella.app/sitemap.xml` |
| `pages_state.indexing_verdict(pages_base_url())` | `subpath` | `root` |

**Changed.**
1. `build.mjs`: `DEFAULT_BASE_URL = 'https://marisstella.app/'`. New
   `GITHUB_PAGES_BASE_URL` (the old value) and `RETIRED_BASE_URLS`
   (`[LEGACY_BASE_URL, GITHUB_PAGES_BASE_URL]`); `rewriteOrigin` and
   `buildWriting`'s `originAlias` rewrite every retired origin to the build's
   base, so venture pages and posts that hard-code github.io still resolve.
2. `writing.mjs`: `relinkSite` makes links to either address root-relative in
   post bodies (107 posts link marisstella.app absolutely, 275 link github.io).
3. `published-base-url.mjs`: comments and the stderr note no longer say "project
   Pages URL". The `project-pages` source key is unchanged, so callers and
   `indexnow.test.mjs` are unaffected.
4. `custom-domain.test.mjs`: the "no reference to the default origin" sweep
   matched the bare host anywhere. With the default now the site's own domain,
   prose ("marisstella.app answered 200", `OLLAMA_ORIGINS=https://marisstella.app`,
   the plain-text `writing/search.json`) tripped it. It now matches the host in
   `href|src|content|action` attributes, `<loc>`, and JSON-LD `url|item|@id|sameAs|contentUrl|image`.
   Sanity check: the same regex flags 9,582 HTML/XML files of a marisstella.app-based build.
5. The `BASE_URL=` usage examples in `journey.mjs`, `sweep.mjs`, `contrast.mjs`,
   `sideways.mjs`, `roundtrip.mjs` and `platform/pages/README.md` name the live origin.

**Not touched.** `platform/ci/build_pages_site.py` keeps its own github.io
`DEFAULT_BASE_URL`. It is the older Python builder behind `.github/workflows/pages.yml`
(control plane), not the site build. `browser-checks-ci.yml` comments still
describe the GitHub Pages origin. Both are `.github/` (CODEOWNERS), so they need
their own PR.

**Next.**
- `browser-checks-ci.yml` fetches `gh-pages` to read a CNAME. Since the move,
  the right reading is the Cloudflare origin, so `published-base-url.mjs` could read
  `platform/pages/cloudflare/wrangler.toml`'s route instead of `gh-pages`'s CNAME.
- Still open from earlier notes: no Lighthouse or dark-mode numbers.
