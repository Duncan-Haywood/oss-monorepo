# Pages builder tests: restore the share-card cache (2026-10-30)

Item 1 of the 2026-10-30 "Not changed, ranked" list guessed that the fixture
builds (`/compare/`, `/guides/`) were slow because they draw ~1,228 research
and writing cards. The profile says the cost is real but sits elsewhere.

## Reading

One-tool fixture build (`buildSite` over a single-page ventures dir,
`disableWorker`), run alone:

- 62 to 74 s wall clock. `--cpu-prof`: 45.7 of 63.8 s is `(idle)`, i.e.
  waiting on the share-card worker threads (`share.mjs`, `drawCards`).
- Child processes (patched `execFile*` timing): under 9 s in all, the research
  homepage `build.py` 2.3 s the largest.

The cards come from the repository's own research and writing pages, not the
fixture, so every fixture build draws them. Inside one test process the
`drawnCards` map makes repeat builds cheap, so the whole-suite cost is the
first build per test file process.

## Change

`portfolio-pages.yml`, `test` job: restore the deploy's `share-cards`
`actions/cache` entry (read only; the `build` job on `main` saves it) and set
`PAGES_CARD_CACHE` on the "Test the site builder" step. No code change:
`renderCards` already reads that variable, and a cached card is byte-for-byte
what a draw produces (keyed by options plus a hash of the renderer and fonts).

## Verification

Same fixture script, `PAGES_CARD_CACHE` set, local container:

| run | wall clock |
| --- | --- |
| cold (empty cache) | 64.1 s |
| warm | 16.9 s |

2,461 PNGs in the cache afterwards. Not measured here: the CI job itself (the
cache only exists on runners). Expect the first build in each test file to lose
about 45 s per job; the next `ci_profile.py` reading will show it.

## Not changed, ranked

1. Warm build is still 17 s: Python subprocesses, `lastmod` git log and the
   per-page passes. An empty-root option for `buildSite` would trim some.
2. `custom-domain.test.mjs` builds in its own process (off the critical path),
   so it pays the draw too unless the cache is present; now covered.
3. P049: jobs per PR head.
4. A PR that changes `sharecard.mjs`/fonts misses every entry (key includes
   them) and falls back to drawing: correct, and unchanged from before.
