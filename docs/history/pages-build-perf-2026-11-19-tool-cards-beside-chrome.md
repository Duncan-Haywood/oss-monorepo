# Pages build perf, 2026-11-19: tool share cards drawn beside the chrome pass

Perf track, run 2026-11-19 (session in the run record).

## How the target was picked

- Both perf backlog rows (P063, P064) are still owner-gated workflow edits.
- `ci_profile.py --runs 600 --top 25` (07:12 to 08:11 UTC): Portfolio Pages'
  "Test the site builder" is still the largest step, 67.4 of 628.7
  job-minutes.
- Per-file reading of `platform/pages` (each file alone, 4-core container):
  the 108 files other than `build.test.mjs`, `custom-domain.test.mjs` and the
  former determinism file sum to 99 s, the largest 7.5 s
  (`faq-coverage.test.mjs`). The full suite took 233 s wall; its first
  `build.test.mjs` test, which awaits the shared build, took 181.7 s. So the
  build is still the long pole.
- `node --cpu-prof build.mjs` with a cold card cache: 133.5 s wall, of which
  the main thread was **idle 79.7 s (60%)**. In 5 s windows, the idle sits in
  two stretches where workers draw share cards (about 20 to 35 s and 60 to
  125 s; 92 to 98% idle). Between them, 35 to 60 s, the main thread runs
  `addSiteChrome` and `finishPagesInOneWalk` with the workers stopped.

## What was tried first and dropped

The card itself (36 ms each in a 100-card bench): `quantize` 26%, zlib 20%,
`field` 16% (amortised away in a real build, cached per accent), text 8%.
Phase timing inside `quantize`: histogram 4.1 ms, median cut 1.9, palette 0.1,
index pass 3.0.

1. **Compact colour table.** A card has about 7,900 distinct colours in about
   110,000 runs, so a 16k-slot open-addressed table (192 KB) in place of the
   64 MB histogram and 32 MB index tables. Same palette and indices on 40
   captured cards plus random, flat and three-colour inputs (48 of 48), but
   8.7 to 9.3 ms against 8.0 to 8.2 ms: no faster. Neighbouring colours sit
   near each other in the big tables, so they were not the cache misses
   assumed.
2. **Index pass by runs.** Record each run during the histogram and fill runs
   afterwards. `Buffer.fill` per run was slower (11 to 12 ms, 110k native
   calls); a plain loop gave 7.7 against 7.9 to 8.2 ms, within noise.

Both reverted. `quantize` is near its floor in plain JavaScript.

## Change

`buildSiteInner` awaited `renderCards(cardJobs)` (one card per category and
per tool, about 1,400) before `addSiteChrome`. It now starts the draw, runs
the `.nojekyll` write and the chrome pass, and awaits the draw just before
`finishPagesInOneWalk`, the first step that touches card files (it draws the
remaining page cards on the same pool; after it, `addModulePreloads` and the
offline layer walk and hash the whole tree).

Why the output cannot change: the chrome pass lists each tool directory but
keeps only `.html` files, and it names a tool's card by its path
(`toolCardFileFor`) without checking the file. The cards are written by
workers to their own paths. A failed draw still fails the build at the await;
a `.catch(() => {})` on the promise only keeps Node from reporting it as
unhandled before then.

## Verification

- **Full site, cold card cache, old and new.** `env -u PAGES_CARD_CACHE node
  build.mjs --out=<dir>`, the old file restored from `HEAD` beside it.
  `diff -rq` finds only `version.json`'s `built_at`. All 34,550 files match.
- **Suite.** `node --test "*.test.mjs" "cloudflare/*.test.mjs"` in
  `platform/pages`: 1,862 of 1,862 pass (134 s, warm card cache).

## Numbers

Same container (4 cores), alternating runs, wall time of `node build.mjs`:

| | round 1 | round 2 | mean |
|---|---:|---:|---:|
| before | 127.0 s | 123.9 s | 125.5 s |
| after | 118.1 s | 119.6 s | 118.8 s |

About 6.6 s (5%) off a cold build. The ceiling was the ~15 s chrome pass; the
overlap gets less than half of it because four card workers and the main
thread now share four cores. On a warm cache the tool cards are file copies
and the gain is small. Cold builds are what a fresh session, a test process
without `PAGES_CARD_CACHE`, and CI after a renderer change all pay.

## Not changed, ranked for the next run

1. **The second card batch (60 to 125 s cold).** About 6,300 page cards drawn
   after `finishPagesInOneWalk`, with the main thread idle. What follows
   (`moveAudioToCdn`, `addModulePreloads` with a whole-tree `listFiles`, the
   offline digests) reads the tree, so overlapping needs those passes to skip
   or wait for `.png` paths explicitly. Not safe as a one-line change.
2. **zlib at level 6, 7 ms a card.** Any other level changes the bytes. It
   needs a size-against-time decision, not a perf patch.
3. **`build.test.mjs` cold, about 180 s inside the suite.** Three full builds
   (shared, child, custom-domain) and a fixture build contend for four cores.
   The 2026-11-19 mark-row note's question still stands: a reading with
   `PAGES_CARD_CACHE` set the way CI sets it.
