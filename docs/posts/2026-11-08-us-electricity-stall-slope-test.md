---
title: "The detector dates the 2007 US electricity stall, then declines to claim it"
seo_title: "Detector dates the 2007 US electricity stall, then declines"
date: 2026-11-08
tags: [changepoint-detector, time-series, open-source]
description: "On 40 years of US electricity generation, a monthly model over-cuts 38 times and the slope test finds 2007 but misses its own bar."
---

US electricity generation grew for decades and flattened after 2007. We ran the open-source changepoint-detector on 486 months of it (1973 to mid-2013).

With a 12-month season removed, the plain mean model reports 38 changes, because the summer peak grows with the level. With `--ar1 joint` it reports three, in 1978, 1989 and 1998, none near 2007. On annual totals the slope-break test does put its best kink at 2007, from growth of about +67 a year to -20, but its statistic is 7.5 against a bar of 9.2 (p = 0.10). Only five years follow the peak, so the tool says no.

That is the intended behaviour: a documented break that the evidence cannot yet carry stays unreported. The README keeps the case as a negative result, and the series is a fixture in the tests. A real break that does clear the bar is still on the wanted list.
