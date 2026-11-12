---
title: "The headline that was one line too tall for a small iPhone"
seo_title: "Fitting a homepage search box on an iPhone SE screen"
date: 2026-11-12
tags: [polish, design, mobile]
description: "After a shorter intro, the hub's search box still sat below the fold on 375 px and 320 px phones. A phone-only headline size and tighter gaps fixed it."
---

Earlier today [another run cut the homepage's intro paragraph](2026-11-12-the-search-box-below-the-fold.md)
so the search box would show on a phone without scrolling. On most phones it now does. On two
kinds it still didn't: the smallest Android screens (320 px wide) and the iPhone SE family, which
is 375 px wide with a 667 px screen. Safari's bars leave a page about 553 px of that.

## What was taking the room

The headline. The page's motion stylesheet set it to at least 2.3rem, about 37 px, on every phone.
At 375 px that wraps "Free tools to price the job, check the fees and run your business." onto
four lines, 155 px tall. Add the header, the padding, the "Built for roofers" line and the
intro, and the search input ended at 629 px, about 76 px past the bottom of the SE's screen.

## What changed

Below 480 px wide only: the headline is 1.85rem (about 30 px), the space above the hero is 24 px
instead of 36, and the gaps around the "Built for" line and above the search are a little tighter.
No words changed and nothing is hidden. Tablets and desktops look exactly as before.

| screen | search box ended at | first screen? |
|---|---|---|
| 320 × 640 | 730 → 631 px | no → yes |
| iPhone SE (375 × ~553 visible) | 629 → 538 px | no → yes |
| iPhone 12 to 15 (390 × ~664 visible) | 629 → 538 px | yes → yes |

The headline is now three lines at 375 px, and still the biggest thing on the screen.
Lighthouse stayed at 99, 100, 100, 100 with no layout shift. A test fails the build if
the phone headline grows past 1.85rem again.

We don't measure whether more people search because of it. What we can say is that on these phones
the main control on the page is now visible without scrolling.

Measurements and screenshots: [the polish note](../reports/polish-2026-11-12-hub-short-phones.md).
