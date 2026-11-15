# Pages build perf, 2026-11-15: app icons from the card cache, share-tag memo swapped in place

Perf track, run 2026-11-15 (session in the run record). Two items from the
"not changed" list in
[`pages-build-perf-2026-11-15-writing-sync-writes.md`](pages-build-perf-2026-11-15-writing-sync-writes.md):
#3 (the app icons are redrawn in every process) and #2 (`metaContent`'s memo
misses after every `setContent`).

## Reading

Container: 4 cores, Node 22.23.4, warm `PAGES_CARD_CACHE`, `node
platform/pages/build.mjs --out=<dir>`. A `--cpu-prof` of one warm build
(37.8 s wall) put `markSample` (sharecard.mjs) at **1,146 ms of self time**,
all of it under `renderIcon` < `addOfflineSupport`: the four app icons
(`icon-192`, `icon-512`, the maskable 512 and the 180 px touch icon), drawn
point by point with 4x4 supersampling, in every build. Their pixels depend
only on `sharecard.mjs`; nothing in the site changes them. The share cards
have had a disk cache since 2026-10-24; the icons never did, so CI's build
job and each test file that builds the site paid for them every time.

## Changes

1. **`cachedIcon` (build.mjs).** `addOfflineSupport` gets each icon through
   the share-card cache directory: key `icon-<cardKey({ appIcon: options })>.png`,
   so the renderer hash (sharecard.mjs, fontraster.mjs, the fonts) is in the
   key and a renderer change misses, exactly as for a card. A card's options
   never consist of a lone `appIcon` field, so the two cannot collide. Hits
   are touched (`utimes`) like cards, so the workflow's 24 h prune keeps
   them; a miss is written to a `.part` file and renamed, so a concurrent test
   process never reads half an icon. No cache dir: `renderIcon` as before. No
   workflow change: the build and test jobs already set `PAGES_CARD_CACHE` and
   save the directory.
2. **The share-tag memo is swapped, not dropped (share.mjs).**
   `completeShareTags` edits `og:image` and `og:image:alt` in place and reads
   tags again straight after; each edit made a new string, so the next
   `metaContent` rescanned the whole page. `setContent` now puts the edited
   tag into the memo when that is exactly what a rescan would find: the memo
   held this page's tags, the tag at that position is the one edited, every
   `<meta` before it began a matched tag, and the new tag reparses as one tag
   from the same offset (a sticky `META`). Anything else drops the memo, as
   before.

## Verification

- **Full build, byte for byte.** Old code (warm) against new code: `diff -rq`
  over 30,142 files differs only in `version.json` (`built_at`). The second
  new build read the icons from the cache; same result.
- **Share pass alone, on the real inputs.** The build's 10,257
  `shareTagsFor` inputs were captured (a temporary dump, removed) and run
  through the old and new module, three rounds each, twice: outputs
  `cmp`-identical (285 MB joined).
- **Tests.** `icon-cache.test.mjs` (new): for each icon, a miss and a hit
  both return `renderIcon`'s bytes, one entry per icon, no `.part` left, a
  hit reads the file rather than redrawing. `share.test.mjs` gains a test that
  the twitter: tags read after the edits see the edited `og:image` and alt,
  on double-quoted, single-quoted and stray-tag pages; with the swap made
  unconditional it fails (2 failures), so it guards the memo. Mutating out
  just the `clean`/reparse guards does not fail it: no realistic page reaches
  them (a stray unclosed `<meta` swallows the tags after it, which the
  position check already catches). They stay as cheap insurance; the full
  build `cmp` is the evidence that they never fire on the real site.
- Full `platform/pages` suite: see the run record's `notes`.

## Numbers

| | before | after | how |
|---|---|---|---|
| The four icons, one process | 1,146 to 1,284 ms (3 runs) | 3 ms (cache hit) | `renderIcon` vs `cachedIcon` over `ICONS`, fresh process each |
| Full warm build, CPU (user) | 34.6, 35.0, 33.5 s | 32.5, 33.1, 33.1 s | `time`, runs interleaved old/new |
| Full warm build, wall | 37.3, 41.4, 42.3 s | 37.1, 39.1, 41.8 s | same runs |
| `META` full-page scans in the share pass | 17,444 (457 MB) | 10,259 (270 MB) | counter in a scratch copy, real inputs |
| Share pass wall, 10,257 pages | 2.23 to 2.94 s | 2.16 to 2.73 s | same harness, 6 rounds each |

So about **1.2 s of CPU per process that builds the site**, which on CI is
the build job plus every site-building test file. Wall time per build moves
by about 1 s on average but drifts by 5 s across a run of builds in this
container, so read the CPU column. The memo swap removed 41% of the full-page
tag scans but only about 0.1 to 0.2 s: profiled, the share pass is
garbage collection (the page strings it rebuilds) and file I/O more than
regex, and the `META` regex's remaining time is the prefix scan up to each
edited tag. It is in because it is exact and costs nothing, not because it
moved the build.

## Not changed, ranked for the next run

1. **The fixture builds re-render the whole blog** (carried from the last
   reading, still the largest test-suite lever).
2. **The writing kicker strips every post's tags to find "N min read"**
   (`pageCardPlan`: `html.replace(/<[^>]+>/g, ' ')` then `(\d+)\s*min read`,
   about 0.2 s a build). A guard on the raw HTML is not exact: stripping
   turns `min<b>read` into `min read`. Reading the post's own word count from
   `writing.mjs` instead would be, if the two agree on every post.
3. **`completeShareTags` rebuilds the page string on every edit and replace**
   (most of the share pass's garbage collection, about 0.9 s a pass). Doing
   all edits in one splice would need the edits collected first; the order
   of reads and writes matters, so it needs the same captured-input `cmp`.
4. **`loadMerges` runs `git log` twice per build; `decision_queue.py --json`
   three times** (carried).
5. P063 and P064 remain owner-gated (workflow files).
