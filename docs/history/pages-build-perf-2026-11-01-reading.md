# Pages build reading and a closed lead (2026-11-01)

Perf track run. No speed-up landed; this records a fresh reading and closes
one lead from `pages-build-perf-2026-11-01-seo-title-gate.md`.

Reading: a cold `node platform/pages/build.mjs --out=<dir>` on `main` at
0eeb1868 exits 0 in 140 s wall (bash `date` before and after, one run, shared
container, so noise of tens of seconds is likely), 6227 HTML files. The
earlier note recorded 2 m 04 s and 6201 pages: 26 more pages and 16 s slower,
which one run cannot separate from noise.

Closed lead: that note asked for a cheap pre-merge check of post front matter
(`seo_title` length). It already exists: `platform/ci/check_post_frontmatter.py`
runs in `portfolio-validate.yml` (line ~489, with its unit test) and in
`portfolio-pages.yml`. It exits 0 on `main` today.

Not changed, ranked: 1. the card worker pool leaves the main thread idle about
60% of a cold build (see `pages-build-perf-2026-11-01-deflate-level.md`);
2. repeat the timing three times on a quiet runner before reading a 10% change.
