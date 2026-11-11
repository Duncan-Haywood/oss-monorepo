---
title: "The Search Button That Sat on Its Own Row"
seo_title: "Fixing a Header That Put Search on Its Own Row, With a Container Query"
date: 2026-11-11
tags: [polish, css, design, site]
description: "From 721px up, every page but the hub put Search on a row of its own. A container query on the header bar fixed it, and no header got taller."
---

A note from an earlier polish run said the site header's Search pill "wraps under the nav at 1,100px". When I measured it, the problem was bigger than that. On every page except the home page, at every width from 721px up, the Search control sat alone on its own row, against the left edge under the logo. Between 721 and 1,080px the header took three rows. On the blog and research pages it took two even on a 1,600px screen.

![Before: the blog header at 1280px, with the search box on a second row](../reports/img/polish-2026-11-11-header-blog-1280-before.png)

The arithmetic explains it. The bar is at most 1,120px wide. The logo takes 153px, the ten section links 721px and the gaps 44px. That leaves room for a 98px "Search" pill, but not for the 236px search box the site pages use, so flexbox wrapped the box. The nav grew to ten links over time, and nobody re-checked the sum.

## What changed

- **One row when it fits, two when it doesn't.** A CSS container query on the header bar's own width decides the layout. When the bar is narrower than one row needs (about 1,016px), the links move to a row of their own and Search goes top right, beside the logo. Tool pages often put the header in a 1,000px column, so the query watches the bar, not the window.
- **The search box gives way.** It now starts at 100px, grows to at most 236px and sits at the right. At 1,280px it fills the 170px the row leaves, and its placeholder says "Search", so it is never cut off.
- **No header got taller.** In two-row mode the 33px pill overhangs the row gap by 4px. Without that, the two-row header would have been 9px taller than before.

![After: one row at 1280px](../reports/img/polish-2026-11-11-header-blog-1280-after.png)

My first try put the container on the `<nav>` element. A before-and-after sweep of 79 pages caught 13 tool pages that had fit one row before and now took two. Their header bar has no side padding, which the nav's width can't see. Moving the container onto the bar fixed it: a container query measures the content box, so padding is already left out.

## The numbers

Header height in pixels, same 79 pages (70 tool pages plus the main site sections), local build, headless Chromium:

| width | median before → after | worst before → after | Search on the logo's row |
|---|---|---|---|
| 390 (phone) | 94 → 86 | 94 → 86 | 79 → 79 |
| 900 (tablet) | 87 → 88 | 126 → 88 | 0 → 79 |
| 1280 (laptop) | 96 → 88 | 126 → 88 | 24 → 78 |

No page got wider than the screen, and no page's header got taller. A unit test now checks the layout rules. It also does a rough width check on the nav labels, so an eleventh link that would break the single row fails the test instead of shipping.

Tool pages in a 1,000px column still use two rows. One row needs about 16px more than they have. Getting there means a shorter label or a wider column, and that is a wording call for another day. The full measurements are in [the run's report](../reports/polish-2026-11-11-header-one-row.md).
