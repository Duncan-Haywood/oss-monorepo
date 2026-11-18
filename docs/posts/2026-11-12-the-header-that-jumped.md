---
title: "The header that jumped: one script moved, 135 of 507 page loads stopped shifting"
seo_title: "Fixing layout shift from a late full-width header script"
date: 2026-11-12
tags: [polish, performance, site]
description: "A script at the end of each tool page stretched its header to full width after first paint. Running it inline cut shifting loads from 135 of 507 to 1."
---

Every tool on this site is its own small page, written in its own style: some centre a 780 px column, some pad the body, some use a grid. The site wraps each one in the same header so a visitor can tell where they are. That header has to run edge to edge whatever box the tool put it in, and CSS cannot reliably escape that box (`100vw` counts the scrollbar and adds a sideways scroll). So a short script measures where the header landed and stretches it to the window's width.

That script sat at the end of the page. The browser is free to paint before it gets there, and often did: the header appeared boxed inside the tool's column, then jumped to full width a moment later. That jump is a *layout shift*, the thing Google's Cumulative Layout Shift (CLS) score measures and readers notice as a page that won't sit still.

## How often

We loaded 169 tool pages three times each in Chromium and recorded every layout shift for half a second after load.

| | page loads that shifted | of those, the header | total CLS |
|---|---|---|---|
| desktop (1,280 px), before | 135 of 507 | 135 | 1.644 |
| desktop, after | 1 of 507 | 0 | 0.017 |
| phone (390 px), before | 140 of 507 | 140 | 0.399 |
| phone, after | 0 of 507 | 0 | 0 |

Each shift was small (Google's "good" threshold is 0.1 per page and the largest single one we saw was well under it), but it happened on more than a quarter of loads, on the first thing a visitor sees.

## The fix

The same measurement now also runs as a tiny inline script directly after the header. At that point the browser has laid out the header and nothing below it, so the script settles the width before anything is painted around it. The end-of-page script still runs on load and on resize, for the footer and for anything that moves later. It is literally the same function text, so when it finds nothing to change it changes nothing. A test checks the two stay identical.

A side effect: tools with a dark background used to show a light header for a moment before the script noticed. That decision now happens early too.

## What it costs

About 2 KB of inline script per tool page, identical on every page. No new request, no new dependency.

The method, the per-page list and what is still open (a scrollbar that appears after the first measurement, on desktops with classic scrollbars) are in the [agent report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-12-header-first-paint.md).
