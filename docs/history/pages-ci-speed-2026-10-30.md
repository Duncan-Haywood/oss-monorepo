# Pages CI: the checker and the test job (2026-10-30)

The owner asked whether the site build could be faster, or partial ("just the
updated parts"), and whether to move to Cloudflare Pages; then said "I want to
work on this a lot" and "let's work on improving the cicd process performance
much more". Continues `pages-build-speed-2026-10-24.md`.

## Cloudflare Pages: no

The site already runs on Cloudflare: two free-plan Workers serving static
assets (`platform/pages/cloudflare/README.md`), which is what Cloudflare now
points new projects to instead of Pages. Pages would bring the same
20,000-file limit on the free plan, and its git-connected builds are capped
at about 500 a month, one at a time, where `main` takes 100+ merges a day.
`wrangler deploy` already uploads only the files whose hash changed, so the
deploy is already partial.

## Where a run's time went

Last successful scheduled run before this change (40982873117, 2026-10-30
00:57, GitHub-hosted runner):

| job / step | s |
|---|---|
| build: checkout, depth 3000 | 90 |
| build: `build.mjs` (warm card cache) | 51 |
| build: `check.mjs` | 69 |
| build: daily brief, dashboard, upload | ~30 |
| deploy (publish, verify, IndexNow) | ~45 |
| **test: "Test the site builder"** | **443** |

The test job does not hold up the deploy, but it is the slowest check on every
pull request that touches `ventures/**`, `platform/pages/**` or `docs/posts/**`,
which is most of them.

## The checker: 82 s to 31 s

Local container (4 cores, Node 22), same artifact (1,321 products, 5,670
pages, 19,461 files), timed by section:

| section | before | after |
|---|---|---|
| inline `<script>` parse | 66 s | 13 s |
| link pass | 22 s | 7 s |
| everything else | 9 s | 11 s |
| **total (wall)** | **82 s** | **31 s** |

1. **Inline scripts, one parse per distinct body.** Each of 7,333 inline
   scripts was written to a file and run through its own `node --check`. Only
   1,462 are distinct: the site's injected scripts repeat on every page. Now
   each distinct (body, module-or-classic) is parsed once and a failure is
   reported for every page carrying it.
2. **Link pass.** The walk already lists every file, so "does the target
   exist" is a set lookup, with the disk asked only on a miss (so a symlink or
   an empty directory reads exactly as before). Files are read 32 at a time
   (`mapLimit` from `share.mjs`), and each file's problems are joined in file
   order, so the report reads as before.

Proof it still catches what it caught: the same three planted defects (an
unparseable inline script, a script with a syntax error, a dead link) in a
hard-linked copy of the artifact are reported identically, word for word, by
the old and the new checker. `check.test.mjs` and `page-identity.test.mjs`:
108 pass.

## The test job: 471 s toward about 200 s

`node --test` runs files in parallel but the tests inside a file one after
another. `build.test.mjs` does a shared full build plus three more of its own
(a determinism pair, the service-worker kill switch, the offline copy), so
that one file was the job. Its slowest tests, cold (s): the first test to call
the shared build 166, `custom-domain.test.mjs`'s build 95, the kill-switch
build 63, the determinism build 62, `/compare/` 60.

1. **Share-card cache for the tests.** The build job has cached its share
   cards since 2026-10-24; the test job drew every card on every run. The test
   builds use `example.test` origins, so they draw different cards (the cache
   grew from 3,766 to 12,290), and the job gets its own daily cache entry,
   saved from `main`. Warm: 471 s to 306 s.
2. **The determinism test moved to its own file** (`build-determinism.test.mjs`),
   so its extra full build runs beside `build.test.mjs` rather than after it.
   Its assertion is unchanged. It now builds twice instead of reusing the
   shared build, which costs CPU but not wall time. The kill-switch test, the
   other one with a build of its own, was measured split out the same way
   (the 208 s below); a parallel session landed a cheaper fix on `main` the
   same day, rendering the worker over a one-page directory, and that is the
   version kept.

A parallel session also gave the test job a read-only restore of the
deploy's card cache (`pages-test-perf-2026-10-30-card-cache.md`). That covers
the research and writing cards. The job now keeps its own entry and falls
back to the deploy's.

Result with both: see "Measured after" below.

## Measured after

Whole suite (`node --test "*.test.mjs" "cloudflare/*.test.mjs"` in
`platform/pages`), same container, same 1,344 tests:

| run | wall |
|---|---|
| before, no card cache (what CI did) | 471 s |
| card cache, warm | 306 s |
| card cache, warm, determinism and kill-switch builds split out | **208 s** |

The same two tests failed in every run, from product pages on that
checkout's `main` (a babysitting-business-kit page without the offline
worker, a shed-designer page missing from its sitemap); both were already
fixed on a newer `main`. The first run of each day fills the cache, so it
pays the cold cost once.

## What the next sessions should take on

Ranked by minutes saved per merge, cheapest first.

1. **Inline-script parse in one process (13 s to about 1 s).**
   `ci-perf-2026-10-30-inline-scripts.md` did this for
   `platform/ci/check_inline_scripts.py`: one `node` process screens every
   script with `vm.Script`/`vm.SourceTextModule`, and only what it rejects is
   re-run through `node --check`, so verdicts and messages are unchanged.
   `check.mjs` can use the same screen.
2. **Checkout (90 s).** The depth-3000 history feeds the changelog, the
   engineering page, the `llms.txt` dates, the audio CDN pins and the daily
   brief. A blob-less clone measured 59 s against 264 s locally (24 Oct) but
   the daily brief's `--numstat` then fetches blobs one by one. Move the daily
   brief into its own job with the full clone (it is added after `check.mjs`
   anyway) and give the site build `filter: blob:none`.
3. **The shared test build (63 s warm).** Most of `build.test.mjs` only reads
   the artifact. Building once in the job, before the suite, and pointing the
   suite at it (an env var `site()` honours) would remove one build, if the
   build job's artifact can be reused across jobs without making PR checks
   wait on each other.
4. **Partial builds.** Rebuilding only changed ventures saves at most 30 to
   40 s of the 51 s warm build, because the hub, sitemaps and injected chrome
   touch every page. Do it after 1 to 3, if at all.
5. **The queue.** One run per ref at a time, with newer pushes replacing the
   pending one. On a busy day the time from merge to live is about two run
   lengths, so every second above comes off it twice.

## The domain, the same day

The owner added `marisstella.app` to the Cloudflare account; it is delegated
to `chelsea`/`darwin.ns.cloudflare.com`. `marisstella.dev` is still
registered but delegated to Hetzner DNS servers that refuse queries for it
(the zone went with the servers on 2026-10-01), so it resolves to nothing and
the released-IP takeover risk is closed. The owner attached `marisstella.app`
to the site Worker in the dashboard, and PR #11849 made the build name it.
