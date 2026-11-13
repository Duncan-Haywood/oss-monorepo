---
title: "The last two pages that jumped on load, and why their fixes were different"
seo_title: "Two layout shift causes a row reservation does not fix"
date: 2026-11-13
tags: [web-performance, cls, css, open-source]
description: "A retainage calculator and a shed designer still scored about 0.2 CLS. One moved a section in a grid, one filled a 641 px strip late. Both are now near 0."
---

Earlier today a script reserved space for the starting rows 67 of our tools
build after first paint, and their layout shift mostly went to zero. Seven
tools didn't change, because their jump came from somewhere else. Two of them
were still over Google's 0.1 "good" line on a laptop-sized window: the
[retainage cash-flow calculator](https://marisstella.app/retainage-cashflow-calculator/)
at 0.201 and the [shed designer](https://marisstella.app/shed-designer/) at
0.194.

**The retainage calculator** lays its sections out in a two-column grid. When
the page first paints, only the form and "Payment milestones" are visible, so
milestones sit beside the form. Then the script works out the default example
and shows five result sections. Milestones drop to the end of the grid, about
500 pixels lower. Nothing got taller; a section just changed places.

**The shed designer** has a strip of ready-made designs that its script fills.
Filled, the strip is 641 pixels tall at every window width we tried, from 320
to 1,600, because its cards are fixed-width columns that scroll sideways. Empty
at first paint, it let the editor sit 641 pixels too high.

Both fixes use the same gate as the row reservation: a rule that only applies
while JavaScript is on and the page hasn't finished parsing, switched off by a
one-line script on `DOMContentLoaded` (module scripts have run by then). On the
retainage page the rule hides every section after the form until the results
exist, so they all arrive together: content that appears isn't a shift, only
content that moves is. On the shed designer it gives the empty strip 620
pixels, a little under what it measures, so different system fonts can only
make it settle up slightly, never leave a gap.

Measured on the built site in Chromium, three loads each:

| page | before, 1,280 px | after | before, 390 px | after |
|---|---|---|---|---|
| retainage calculator | 0.201 | 0.000 | 0.000 | 0.000 |
| shed designer | 0.194 | 0.002 | 0.088 | 0.005 |

With JavaScript off, neither page changes. Five tools on the original
list still shift a little (0.002 to 0.068), each for its own reason; the
[report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-13-late-reveal.md)
lists them. We haven't measured whether any of this changed traffic.
