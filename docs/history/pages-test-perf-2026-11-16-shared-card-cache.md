# Site-builder suite on a cold card cache: 403 s to 230 s (2026-11-16)

**Why.** The top live, ungated doc-friction cluster (`platform/ci/friction_rank.py
--live --ungated --days 3`, 7 sessions 2026-11-13..16) was
`run_workflow_locally.py --for-changes` running out of budget in
portfolio-pages' "Test the site builder" step. Earlier fixes kept the share-card
cache between local runs (#15967) and put cheap jobs first. But a cloud session
starts in a fresh container, so its first sweep always runs on a cold cache, and
most sessions only run one sweep.

**What the cold suite spent its time on.** `node --test --test-reporter=tap
"*.test.mjs" "cloudflare/*.test.mjs"` in `platform/pages`, 4 cores, no card
cache: 410 s. Two tests carried almost all of it, the first `await site()` in
`build.test.mjs` (357 s) and the first test in `custom-domain.test.mjs` (281 s).
A CPU profile of the custom-domain fixture build alone (2 fixture ventures, 82 s)
showed 60 s of main-thread idle, waiting on share-card worker threads. With a warm
`PAGES_CARD_CACHE` the same build took 22.7 s.

The suite runs four builds at once in separate processes: the shared catalogue
build, its determinism child, the hub fixture build and the custom-domain build.
A card's key covers its options, and those include the base URL. So the two fixture
builds (`https://example.test/`, `https://catalogue.test/`) drew their own ~7,000
cards each. Every post and research page gets one, even when only 2 fixture ventures
are built. No test in either file reads a card. The two catalogue builds share a key
space, but each checked the cache only before drawing and stored cards only after
drawing, so on a cold cache both drew everything.

**Change.**

1. `share.mjs` `renderCards`: each card goes into the cache as soon as it is drawn,
   written to a temporary name and then renamed, so no reader copies half a PNG.
   Each build shuffles the order it draws its misses in, and checks the cache again
   just before each draw. Builds that share a directory now split the work.
2. `buildSite({ cards: false })` (`setCardDrawing` in `share.mjs`) keeps the share
   tags but draws and copies no card. The hub fixture build (`build.test.mjs`) and
   `custom-domain.test.mjs` pass it.

**Measured** (same machine, full suite, fresh empty `PAGES_CARD_CACHE` each time,
one run each):

| version | cold | cards stored | warm |
|---|---|---|---|
| main (74d680fe5) | 403 s | 20,920 | 140 s (earlier run) |
| shared cache only | 360 s | 20,920 | |
| shared cache + fixture builds skip cards | **230 s** | 7,937 | 144 s |

All 1,741 tests passed (1,739 before, plus the two new ones in `share.test.mjs`).
A warm run is unchanged within noise. CI restores the cache from main, so CI gains
only on a cache miss (for example when the renderer changes). The win is local, in
fresh cloud containers. It also shrinks the local cache by 13,000 files (about
600 MB at ~48 KB a card).

**Not done.** A cold local sweep is still about 230 s for this one step, so a
sweep's 300 s pooled budget can still run out when several workflows are selected.
The next lever is the two catalogue builds (shared and determinism child). They
still draw their misses at the same time; the shuffle stops them repeating each
other's cards but does not cut the total work below one full set.
