# CI perf, 2026-11-10: pool and page-weight reading, no change landed

Perf-track run with no landable lever. Recorded so the next run does not repeat the reading.

## Pool reading

`python3 platform/ci/ci_profile.py --runs 300 --top 15`: 302 jobs in 21 workflows,
2026-11-09 23:59Z to 2026-11-10 00:58Z, 157.4 job-minutes, 74.9 of them checkout (48%)
and 7.0 setup/teardown.

| workflow | jobs | min | checkout share |
|---|---|---|---|
| Portfolio Pages | 64 | 34.2 | 51% |
| ventures tests | 14 | 29.4 | 16% |
| Conflict markers | 28 | 13.4 | 75% |
| Portfolio validate | 23 | 12.6 | 78% |
| Portfolio Pages site build | 14 | 11.2 | 45% |

Heaviest steps: Pages "Test the site builder" 8.7 min, ventures "node --test in each
touched venture" 22.9 min (one batch), Branch cleanup "Sweep closed pull requests" 6.2 min
(a single job; already sparse since 2026-11-06).

The pool is checkout-bound, as on 2026-11-09. P063 (sparse checkout for ventures-tests)
and the small-guard checkouts are all under `.github/workflows/`, which CODEOWNERS holds
for the owner. P064 landed on 2026-11-08 (`ci-perf-2026-11-08-gallery-search-stamp.md`);
its backlog row is stale.

## Local build and page weight

`node platform/pages/build.mjs --out=<dir>` on a clean tree: 2 m 17 s wall, 4 m 44 s user,
1.1 GB, 24,549 files, 8,057 HTML pages (mean 23.6 kB).

- On first try the build failed: `docs/posts/2026-11-09-china-uscc-...md` had a 75-character
  `seo_title` (limit 70). `origin/main` already carried the fix (#14395); my checkout was
  one commit behind. Fast-forwarding and rebuilding passed.
- Largest non-media files: `writing/search.json` 4.7 MB and `search-index.json` 4.5 MB,
  both fetched lazily on first keystroke (`writing.mjs:399`, `build.mjs:8743`), so no
  page load pays for them. `guides/index.html` is 1.02 MB raw, 210 kB gzip (1,601 guides
  listed): the one eager page that is heavy, and it is a deliberate listing of every guide.
- Audio and video (MP3 10 to 16 MB each) dominate the bytes but are `preload`-gated media.

## Not changed, ranked

1. P063 and sparse checkouts for guard workflows: owner-gated, still the biggest lever.
2. `guides/index.html` (210 kB gzip): could paginate by audience, but it is an SEO
   crawl surface, so a change needs a ranking argument, not only a speed one.
3. Searching for more Python/Node hot loops: nine passes in this series found them
   already minimal.
