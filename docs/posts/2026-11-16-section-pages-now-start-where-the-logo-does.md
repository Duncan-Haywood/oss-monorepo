---
title: "Section pages now start where the logo does"
seo_title: "Stories, Updates, Work queue and Research now line up with the logo"
date: 2026-11-16
tags: [polish, site-build, design, research, stories]
description: "Stories, Updates, the work queue and Research started their heading at a different place from the logo above it. Now all five section pages line up."
---

Every page on this site has the same bar across the top: the logo, the
section links and a search box, in a 1,120 px column. Until today, the pages
under it didn't agree on where their own content started. At a 1,280 px
window, measured from the left edge to the start of each page's main heading:

| page | before | after |
|---|---|---|
| logo in the site bar | 96 px | 96 px |
| [home](/) | 96 px | 96 px |
| [Stories](/stories/) | 176 px | 96 px |
| [Updates](/updates/) | 176 px | 96 px |
| [Work queue](/queue/) | 176 px | 96 px |
| [Research](/research/) | 74 px | 96 px |

Click from the home page to Stories and the heading moved 80 px to the
right. Click on to Research and it moved 102 px back the other way, past the
logo. The bar stayed put the whole time, so the jump read as a different site.

Two causes. Stories, Updates and the work queue each centred a 960 px column
inside the bar's 1,120 px one. The research index is built by its own
template, and that template used a 1,180 px column with a 24 px gutter, so its
heading started 22 px left of the logo and its research map stuck out 22 px
past the search box on the right.

## What changed

All four now use the bar's column: 1,120 px wide with a 16 px gutter. At
1,440 px the heading and the logo both start at 176 px, and at 390 px both
start at 16. No page scrolls sideways at any of the three widths.

A wider column brings two things to fix as well:

- **Line length.** The work queue's intro and its cards' paragraphs would have
  run to about 130 characters a line, well past comfortable reading.
  Paragraphs and list items on Updates and the queue are now capped at 78
  characters. Tables and card grids still use the full width, which is what
  the wider column is for.
- **Orphans.** Updates shows six "this week in numbers" tiles. At the new
  width they would have broken four and two. Each tile's minimum width went
  from 250 to 300 px, so they sit three and three.

The blog index and blog posts keep their 720 px reading column. That is a
different layout on purpose: one column of prose, centred.

## Keeping it fixed

A new test, `platform/pages/index-column.test.mjs`, reads the site bar's
width and gutter and fails if the Stories, Updates, queue or research index
column differs from it. It fails on the old code, four checks out of four.
The next time someone tunes one page's width, they'll find out it's part of
a set.
