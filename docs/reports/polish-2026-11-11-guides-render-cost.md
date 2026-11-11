---
kind: polish
topics: [performance, guides, content-visibility, lighthouse, tooling]
date: 2026-11-11
---
# Polish 2026-11-11: /guides/ skips rendering off-screen tool blocks (mobile TBT 883 to 50 ms)

## Why this page

`polish-2026-11-11-heading-order.md` named /guides/ the slowest page in its Lighthouse sample
(mobile perf 82, TBT 656 ms) and asked for a measurement before any fix. /guides/ is the index
that a search for "how is X priced" lands on, linked from every tool's guide pages.

## What was slow

The page lists every guide in the catalogue: **1,626 cards in 609 tool blocks**, in 14 trade
sections. The built HTML is **1.05 MB (218 KB gzipped)**, about 8,200 elements, and **265,000 px
tall on a 412 px phone**. It was written for 342 guides, and the catalogue has grown about
fivefold since.

Before choosing a fix I A/B tested copies of the built page in dist (`longtask.mjs`, CPU 4x,
412 px, median of 5):

| variant | style ms | layout ms |
|---|---|---|
| a. as built | 238 to 267 | 682 to 807 |
| b. JSON-LD ItemList removed (324 KB of the 1 MB) | 237 | 688 |
| c. no pf-site.js | 236 | 661 |
| d. each tool's list past 3 cards folded into `<details>` | 203 to 215 | 434 to 454 |
| e. d + `content-visibility:auto` on the trade sections | 56 to 63 | 73 to 78 |
| f. `content-visibility:auto` on the trade sections only | 52 | 79 |
| g. `content-visibility:auto` on each tool block only | 81 | 87 |

So the cost is style and layout of the whole list at load. Neither the JSON-LD bytes nor the
site script matter. Skipping rendering of what is off screen (f, g) removes about 85% of it
without hiding anything from the reader, which folding (d) would have done. I shipped g:
tool blocks are small enough that a placeholder size can be estimated well, and trade sections
are not (559 to 53,560 px tall).

## The catch: the placeholder must never be too short

The first version sized each block from its row count (`a + b × rows`, fitted per column count,
median error about 5%). Lighthouse's TBT fell to 50 ms, but **accessibility fell from 100 to 96**:
`target-size` failed 16 cards. A skipped block keeps its placeholder height while its cards
still lay out at full size, so where the estimate was short (178 of 609 blocks at 412 px, up to
37% short at 320 px), the cards overflowed into the next block for anything that measures them
off screen. A reader never sees it, because a block gets its real height as soon as it nears the
viewport. But it would fail the `--min-a11y=100` gate earlier notes propose. `overflow: clip`
on the block did not help: axe still reads the rects.

What shipped: `guideBlockHeights(title, items)` in `build.mjs` computes an **upper bound** per
block from its own text. The h3 is 20 px a line, plus the note, then each grid row is as tall as
its tallest card (26 px of padding and border, 21.8 px a link line, 5 + 20.4 px a description
line), with 10 px gaps. There are seven width steps (0, 360, 412, 480, 688, 840 and 1,018 px).
The 688 and 1,018 steps are where the grid goes to two and three columns, measured in Chromium.
Each step has a characters-per-line count for titles, links and descriptions, fitted at that
step's narrowest width as the largest count that never under-counted a line across all 1,626
cards. A ×1.012 + 4 px margin covers Chromium's sub-pixel line boxes. The block carries seven
`--hN` custom properties, and one media rule per step reads its own.

Against the real heights of every block (the as-built page, no content-visibility):

| width | blocks short | smallest ratio | page height over by |
|---|---|---|---|
| 320 | 0 | 1.019 | 14.6% |
| 360 | 0 | 1.017 | 9.1% |
| 412 | 0 | 1.013 | 5.7% |
| 500 | 0 | 1.018 | 9.6% |
| 688 | 0 | 1.013 | 8.1% |
| 768 | 0 | 1.023 | 20.7% |
| 900 | 0 | 1.014 | 4.9% |
| 1018 | 0 | 1.014 | 7.9% |
| 1280 | 0 | 1.020 | 16.4% |

Over-estimates only make the scrollbar a little long until blocks have been seen, and
`contain-intrinsic-size: auto` keeps each block's real height once it has rendered. The "Jump
to a trade" links landed each heading 14 px from the top before and after (g-trades, g-ci,
g-learning and g-more at 320, 412, 768 and 1,280 px). On the rebuilt page, 0 blocks overflow
their box at page top (178 did with the row-count version). The phone screenshot after a jump
to "Learning & practice" looks the same before and after.

## Numbers (the rebuilt site, local, Lighthouse 12.8.2)

| /guides/ | perf | a11y | FCP ms | TBT ms |
|---|---|---|---|---|
| mobile, devtools throttling, before (two sets of 3 runs) | 78, 82 | 100 | 1828, 1850 | 883 (659-918), 651 (574-691) |
| mobile, devtools throttling, after (row-count version, then shipped) | 99, 98 | 96, **100** | 1778, 1770 | 50 (30-73), 120 (63-135) |
| mobile, simulated, before → after (median of 2) | 87 → 98 | 100 → 100 | 1804 → 1805 | 447 → 63 |
| desktop, simulated, before → after | 100 → 100 | 100 → 100 | 428 → 403 | 0 → 1 |

`longtask.mjs` (CPU 4x, 412 px, median of 5): style 238 → 89 ms, layout 705 → 93 ms.
The page grew 7 KB gzipped (218 → 225 KB) for the seven sizes per block.

The rebuilt site passes `check.mjs` (8,534 pages, no dead links) and `heading-order.mjs`
(0 skips). The pages test suite results are in the PR's run record.

## Traps for the next run

- **`longtask.mjs`'s blocking column read 0 for /guides/ before and after**, while Lighthouse's
  devtools TBT read 651 to 883 ms before. Either long-task entries are not buffered (the
  observer is attached by an init script, so this seems unlikely) or a streaming 1 MB parse
  splits the work into sub-50 ms tasks that Lighthouse's trace counts differently. On this
  page, read the style and layout columns, or Lighthouse devtools. Not investigated further.
- **The first page in a `longtask.mjs` list is not special.** I suspected the zero came from
  run order. A copy of the as-built page placed first and second read the same.
- **Importing `build.mjs` from a script writes `dist/queue/`** (a top-level side effect). It is
  harmless, but it is surprising in a measurement script.

## Still weakest, and what I would do next

1. **/guides/ lists pages that are not guides.** "Learning & practice … for small businesses"
   holds Hearth & Horizon's 342 bedtime stories as "342 pages beside the calculator", and
   Self-hosted business apps lists monastery-site's demo pages ("About Saint Aelred's Abbey",
   "Altar breads") as guides. The heading promises "how a price is built up". `discoverGuides`
   (`build.mjs`) takes any extra page a product publishes. A filter on product kind (story and
   demo sites out) would make the index truthful, and it would also cut the page by about a quarter.
   It touches `guide-coverage.mjs` and the search index, so it needs its own run.
2. The other long site-built indexes (the blog index `writing/`, `c/<category>/` pages with
   100+ tools) may be in the same position. Measure each with `longtask.mjs` style and layout
   columns before reusing this. `guideBlockHeights` is specific to the guides card.
3. Still open from earlier notes: `--min-a11y=100` and `heading-order.mjs` in the nightly
   browser checks (control-plane CI, own PR).
