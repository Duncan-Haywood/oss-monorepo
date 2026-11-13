---
title: "Why 67 of our tools jumped on load, and the one script that holds their place"
seo_title: "Fixing layout shift from rows a module script adds"
date: 2026-11-13
tags: [web-performance, cls, css, open-source]
description: "Tools that build starting rows in a module script made the page jump on load. Measured heights, held until DOMContentLoaded, took CLS from 2.95 to 0.07."
---

Open the window replacement bid calculator on a laptop and, for a moment,
"The openings" is just a heading and a button, with "The job" right under it.
Then four rows of openings arrive and push everything 884 pixels down. If
you were reaching for a field, it moved.

The cause is ordinary. The page ships an empty `<div id="openings"></div>`
and fills it from a `<script type="module">`. Module scripts run after the
document is parsed, and the browser is free to paint before that. Google's
Cumulative Layout Shift counts that jump; on that page it was 0.087.

It was not one page. A script that opens every tool, keeps the empty
containers that hold form fields once the page has loaded, and measures
them found 74 such tools: bid calculators, but also the worker
classification checker, the VSME report builder and the SAFE dilution
calculator. Before the fix, 62 of the 67 we kept jumped at desktop width.

The fix holds the space. For each container the script measures its filled
height at every 4 pixels of window width from 320 to 1,600, groups the
widths into a few bands, and writes a `min-height` per band that applies only while
scripting is on, the container is empty and the page has not reached
`DOMContentLoaded` (module scripts have run by then). Each band reserves
the smallest height it measured, so the rows never come in shorter than the
space held for them. Turn JavaScript off, or delete every row, and no gap
appears.

The numbers, three loads of each page at 1,280 and 390 pixels wide:

| | desktop before | after | phone before | after |
|---|---|---|---|---|
| total layout shift, 67 pages | 2.95 | 0.07 | 1.81 | 0.00 |
| pages that shift at all | 62 | 6 | 44 | 0 |
| pages over the 0.1 "good" line | 3 | 0 | 6 | 0 |

Seven tools showed no change and were left alone: something else moves on
those pages (a section shown late, a drawing canvas), and each needs its own
fix. A test now fails if a tool that builds starting rows ships without the
reservation. The script is `platform/pages/rows-reserve.mjs`, MIT licensed
like the rest.
