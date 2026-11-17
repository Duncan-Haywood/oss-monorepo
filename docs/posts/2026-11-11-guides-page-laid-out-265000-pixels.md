---
title: "Our Guides page laid out 265,000 pixels before anyone scrolled"
seo_title: "content-visibility on a 1,626-card index: TBT 883 ms to 50 ms"
date: 2026-11-11
tags: [performance, site, polish, accessibility]
description: "A 1,626-card index cut mobile blocking time from 883 ms to 50 ms with content-visibility, once the placeholder heights could never be too short."
---

The [Guides page](https://marisstella.app/guides/) lists every explainer page the site's tools
publish: how a price is built up, when one option beats another. It began with 342 entries.
It now holds **1,626 cards in 609 tool blocks**: about a megabyte of HTML, and 265,000 px tall
on a 412 px phone. That is roughly 300 screens.

Lighthouse on a throttled phone scored it 78 for performance, with **883 ms of total blocking
time**, the worst of any index on the site.

## Finding where the time went

I made copies of the built page with one thing changed in each and timed them in Chromium at 4x
CPU slowdown:

- Dropping the 324 KB of structured data: no change.
- Dropping the site's only script: no change.
- Folding each tool's list after three cards: layout went from about 700 ms to 440 ms.
- Leaving everything visible but adding `content-visibility: auto`: style went from 238 to 81 ms
  and layout from about 700 to 87 ms.

So the cost was the browser styling and laying out all 300 screens on load. `content-visibility:
auto` tells it to skip a block until the block nears the viewport. The cards stay in the page, so
find-in-page, links and search engines still see all of them.

## The part that bit

A skipped block needs a stand-in height, or the page collapses and the scrollbar is useless. The
first version estimated it from the number of rows, which was accurate to about 5% on average.
Blocking time fell to 50 ms. But Lighthouse's **accessibility score fell from 100 to 96**: 16
links "too small or overlapping".

The cause: a skipped block keeps its stand-in height while its cards still lay out at full size.
Wherever the estimate was short, the cards ran past the block's bottom and sat on top of the next
block's cards. That happened on 178 of the 609 blocks on a phone. No reader would see it, because
a block takes its real height before it scrolls into view. But an audit that measures off-screen
elements does see it.

The fix was to make the estimate an upper bound instead of an average. The build now works out
each block's height from its own text: lines in the title, then for each row of cards, the
tallest card's link and description line counts. The characters-per-line figures were fitted at
the narrowest width of seven width steps, so that no card's line count is ever under-estimated.
Checked against the real heights of all 609 blocks at nine widths from 320 to 1,280 px, none is
short. The page comes out 5.7% too tall on a 412 px phone before it has been scrolled, and the
browser swaps in each block's real height once it has been seen.

## Before and after

Lighthouse 12.8.2, the locally built page, mobile:

| | performance | accessibility | blocking time |
|---|---|---|---|
| before (devtools throttling) | 78 to 82 | 100 | 651 to 883 ms |
| after (devtools throttling) | 98 to 99 | 100 | 50 to 120 ms |
| before → after (simulated) | 87 → 98 | 100 → 100 | 447 → 63 ms |

Desktop was already at 100 and stays there. The jump links still land each heading in the same
place, and the page looks the same. The cost is 7 KB more gzipped HTML for the stand-in heights.

The measurements, the dead ends and what to fix next are in
`docs/reports/polish-2026-11-11-guides-render-cost.md`.
