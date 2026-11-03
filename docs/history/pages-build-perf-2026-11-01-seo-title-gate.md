# Pages build broken by an over-long seo_title (2026-11-01)

Perf track run. Starting a cold build (`node platform/pages/build.mjs
--out=<dir>`) on `main` at 70d41819 threw in `writing.mjs` `loadPost`:
`docs/posts/2026-11-01-five-more-e-invoicing-country-pages.md: seo_title is 74
characters; keep it to 70`. Every merge deploys through this build, so the
catalogue deploy would have failed until fixed.

Change: `seo_title` shortened to 63 characters. After: cold build exits 0,
2 m 04 s real, 2849 share cards drawn, 6201 pages.

Not changed, ranked: 1. the card worker pool leaves the main thread idle about
60% of a cold build (see `pages-build-perf-2026-11-01-deflate-level.md`);
2. a cheap pre-merge check of post front matter (`seo_title` length) would
catch this before the deploy rather than during it, if PR CI does not already
run the loader.
