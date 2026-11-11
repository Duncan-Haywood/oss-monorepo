---
title: "Why our bid calculators jumped after they loaded, and the Lighthouse fix we didn't make"
seo_title: "Fixing cumulative layout shift from hidden bars revealed by script"
date: 2026-11-11
tags: [performance, polish, lighthouse, layout-shift, static-site]
description: "Median layout shift on 14 tool pages fell from 0.113 to 0.002. The bigger Lighthouse win, dropping module preloads, was a simulation artifact."
---

Open one of our trade bid calculators on a phone and start reading the
heading. A moment later the page jumped down by about two lines. On the
chimney-sweep calculator it jumped 144 pixels. That is cumulative layout shift
(CLS), and that page scored 0.253. Google rates 0.1 or less as good and
anything over 0.25 as poor.

There were two causes. Both were in the shared site chrome, not in any one
tool:

- **A notice for visitors without JavaScript broke a CSS selector.** The site
  header is pinned to the top edge by a rule that applies when the header is
  the page's first element. Two days ago we started inserting a "this tool
  needs JavaScript" `<noscript>` notice above it. With JavaScript on, that
  notice shows nothing, but it is still an element, so the header was no longer
  first and the rule stopped matching on 2,019 pages. A script then moved the
  header up 24 pixels after the page had painted.
- **Two helper bars appeared after the page painted.** "Your shop rates" and
  "Saved bids" only work with JavaScript, so they ship hidden and a script
  reveals them. The script runs on `load`, after first paint, so the heading
  below them moved down by each bar's height.

The fixes are CSS. The selector now also accepts a `<noscript>` before the
header. When scripting is on (`@media (scripting: enabled)`), a hidden bar is
laid out invisibly, so its space is held from the first frame and it does
nothing until its script runs. The shop-rates bar's markup now contains the
sentence its script would write for a first-time visitor, so the held space is
the right height.

Measured on every 12th page that has the bars, after load, at phone width:

| | before | after |
|---|---|---|
| median CLS (14 pages) | 0.113 | 0.002 |
| worst page | 0.253 (chimney sweep) | 0.007 |
| pages over 0.1 | 6 | 0 |
| wall-framing-takeoff, Lighthouse | 0.084 | 0.003 |

## The bigger number we left alone

Lighthouse first suggested something else. Our top flagship,
wall-framing-takeoff, scored 83 for performance, and deleting its 43
`<link rel="modulepreload">` tags raised that to 96. Those tags let the browser
fetch the tool's whole module graph at once instead of eleven imports in a
row.

Lighthouse's default mode doesn't throttle a real page load. It records an
unthrottled load and simulates a slow phone from it, and that simulation
counts every file that arrived before first paint as part of the paint's cost.
We repeated the test with real network throttling. First paint was about 1.45
seconds with or without the preloads, and with them the tool was ready to use
about 0.3 seconds sooner. Removing them would have bought a better score and a
slower tool, so they stayed. Our Lighthouse script now has a
`--throttling=devtools` switch for checking a simulated result like this one
before acting on it.

Details, every number and what is still weak are in the
[run report](../reports/polish-2026-11-11-tool-page-layout-shift.md).
