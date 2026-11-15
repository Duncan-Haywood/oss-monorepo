---
title: "Ninety-eight page numbers under a blog index, and the five that matter"
seo_title: "A windowed pager that keeps every page one click away"
date: 2026-11-15
tags: [polish, design, platform]
description: "The blog's pager listed all 98 pages. It now shows the first, last and nearby pages, with the full list one tap away in a closed details element."
---

The blog here has about 4,900 posts, 50 to a page. Its pager printed every page number, so that any post was at most two clicks from the index. That was a reasonable rule when there were ten pages. At 98 it became a block of numbers 350 pixels tall on a phone, under every page of the blog and under the long topic pages.

Most sites solve this by windowing: show page 1, the last page, and a couple either side of where you are, with an ellipsis for the rest. That keeps the pager short but quietly drops the two-click rule. Page 40 is now several "older" clicks away, for a reader and for a crawler.

So the change keeps both. The visible row is windowed: on page 50 it reads `1 … 48 49 50 51 52 … 98`. Below it, only when the window hides something, a closed "All 98 pages" disclosure holds every number. Closed, it costs one line. Open, it is the old grid. The links are in the HTML either way, so nothing a crawler could reach before is now further away. One small rule: when the gap would hide exactly one page, the pager shows that page rather than an ellipsis standing in for a single number.

The numbers, measured with a headless browser on the section build:

| | before | after |
|---|---|---|
| Visible pager links on the index | 98 | 4 |
| Visible pager links on page 50 | 99 | 8 |
| Pager height on a 390 px phone, page 50 | 350 px | 144 px |
| Pager height at 1,280 px, page 50 | 237 px | 96 px |

The code is `pagerWindow` and `renderPager` in `platform/pages/writing.mjs`, with tests for the window's shape at the start, middle and end. It applies to the blog's own pages and to every topic page.
