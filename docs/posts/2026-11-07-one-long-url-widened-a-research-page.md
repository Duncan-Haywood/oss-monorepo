---
title: "One long URL made a research page 663 pixels wide on a phone"
seo_title: "Fixing sideways scroll: a long URL and a hidden label"
date: 2026-11-07
tags: [site, accessibility, polish]
description: "A sample sweep of 374 pages at phone width found two that scrolled sideways. The causes were a URL that could not wrap and an off-screen label."
---

We probed 374 pages of this site at 390 px wide. Two scrolled sideways.

A research log page ran to 663 px because one list item held a 150-character link with nowhere to break. The fix is one CSS line, `overflow-wrap: break-word`. A pharmacy margin calculator reached 484 px for a stranger reason: screen-reader-only labels are absolutely positioned, and inside a scrolling table that is not itself positioned they escape the clip. Making the table `position: relative` contains them.

A sideways page makes the browser shrink everything to fit, so the text on it is smaller for every visitor. The sweep is now `SAMPLE=400 node platform/pages/sideways.mjs`, and its culprit report skips clipped scrollers, which had misled the first diagnosis. Measured on a rebuilt copy of those pages; the full site build was not re-run.
