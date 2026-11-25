# Pages build: related posts by top-k selection, not a full sort (2026-11-25)

Perf track, version 0. Both open perf backlog items (P063, P064) touch
owner-only workflow files, so this run took item 3 ("the slowest local step an
agent session waits on"): the site-builder test suite.

## Reading

Pool (`python3 platform/ci/ci_profile.py --runs 600 --top 25`): Portfolio Pages
is still the largest workflow (145.6 job-minutes in the window), and "Test the
site builder" its largest step (61.3 min).

Local, 4 cores, no card cache: `node --test "*.test.mjs" "cloudflare/*.test.mjs"`
in `platform/pages`, 2,093 tests, all pass, **6 m 20 s wall, 16 m 27 s user**.

Each file alone and in series (`node --test --test-concurrency=1 <file>`):

| file | ms |
|---|---:|
| `build.test.mjs` | 349,201 |
| `custom-domain.test.mjs` | 40,467 |
| `faq-coverage.test.mjs` | 8,553 |
| `clauses.test.mjs` | 7,520 |
| `heading-order.test.mjs` | 5,743 |

`custom-domain.test.mjs` is one fixture build (one venture page) and a sweep.
Rebuilding that fixture with phase logging: 32.5 s total, 3.4 s to the venture
pages, **21 s in the writing section** (7,367 posts at this commit). A fixture
build still renders every real post, which the custom-domain test needs: its
property is that *nothing* in the artifact names the default origin, posts
included. So the writing phase is the cost to cut, not to skip.

`node --cpu-prof` of that build, self time: file writes 6.9 s, idle 7.5 s,
GC 2.3 s, mkdir 1.7 s, then `rankRelated` (writing.mjs) 1.2 s, its closures
another ~0.8 s, and the `findIndex` callback in `renderPostPage` 0.55 s.
Writes are the output itself (10,063 files, 406 MB); left alone.

## Change

`platform/pages/writing.mjs`:

- `rankRelated` scored each post's candidates in a fresh `Map`, sorted every
  candidate (often thousands) to keep 5, and on the fill path sorted the whole
  topic, then every other topic, by nearness in date. It now adds scores into
  one reusable `Float64Array` and keeps the best k as candidates arrive. Both
  orders are total (ties end on the post's index), so the best k kept this way
  are exactly the first k of the full sort, and each score is the same floats
  added in the same order. The old function stays as `rankRelatedBySort`; the
  new one falls back to it for a date that does not parse, a list length that
  is not a whole number of at least 1, or an array grown since its index.
- `renderPostPage` found the post's position with `findIndex` per page (7,367
  × 7,367 comparisons); a slug-to-first-index map per posts array (the
  `siblingTargets` pattern) replaces it, falling back to `findIndex` if the
  index no longer holds the slug.

## Verification

- `relatedPosts` for every real post (7,367): before and after written to a
  file each, `cmp` identical. `rankRelated` vs `rankRelatedBySort` for every
  real post at n = 1, 3, 5, 20: 0 mismatches.
- New test in `writing.test.mjs` pins `rankRelated` against
  `rankRelatedBySort` on 300 generated posts with tied scores and dates,
  duplicate slugs, a post outside the array, n = 0, -1, 2.5, 400, and an
  unparseable date. Mutation check: dropping the date tie-break from the new
  path fails it.
- The custom-domain fixture build before and after: `diff -rq` over all
  10,063 files differs only in `feed.xml` `<updated>` and `version.json`
  `built_at`, the build's own clock.
- `node --test writing.test.mjs`: 63 of 63 pass. Full suite: see the run record.

## Numbers

| measure | before | after |
|---|---:|---:|
| `relatedPosts` for all 7,367 posts | 1,955 ms | 492 ms |
| `rankRelated(·, 20)` for all posts | 1,797 ms | 510 ms |
| custom-domain fixture build (two runs each, alternating) | 27.5 s, 29.8 s | 24.3 s, 26.8 s |

About 3 s off every full or fixture build that renders the blog, including
the deploy build, with byte-identical pages.

## Not changed, ranked for the next run

1. `build.test.mjs`, 349 s in series, is still the suite. The earlier
   readings (`ci-perf-2026-11-10-site-tests-local-reading.md`) say the lever is
   fewer distinct full builds; that count has not been redone since.
2. Writing-phase file writes, 6.9 s + 1.7 s mkdir for 10,063 files: the
   output itself. A smaller post page (shared chrome in a cached file) would
   cut both and help visitors; that is a page-weight change, not a perf-only one.
3. `idle` 7.5 s in the fixture build profile: the research builder's child
   process runs beside the JS passes; not profiled here.
4. `pay-app-guides` (bet #1 front door) tests take 2.4 s in all; its pages are
   18–27 KB of HTML. Nothing to win there.
