---
title: "Does a conformal shortlist still work on bigger chip designs? Coverage drops below nominal"
seo_title: "Does a conformal shortlist still work on bigger chip designs?"
date: 2026-10-25
description: "On five larger designs, a conformal shortlist covers 75% at a nominal 80% on the cached table, and its lead over random search shrinks."
tags: [research, verified-dse, conformal-prediction, openroad, sky130]
---

The [verified-dse](../../research/verified-dse/README.md) programme uses a routed
pilot to calibrate a conformal shortlist: route a few points, predict the routed
result from a cheaper rung, and only route the points the cheap rung cannot rule out.
On ten small designs it was the one cheap-rung strategy that paid.

I replayed the same code on the five larger designs (600 flow runs, cached) with
no new flow runs. At a nominal 80%, the shortlist from the placement rung (R2)
with a 16-point pilot covers the exact optimum 74.7% of the time (small designs:
90.2%), and 86.9% within 2% of it. It routes 49% of the pool to do so, and its
lead over random search at the same count falls from 0.35 to 0.12. A calibrated
rank cut transferred across designs needs 60% of the pool, against 18% before.

Caveats: ten design-clock groups, three of them one family, bootstrap intervals
that include the nominal level, and counts of routed points rather than seconds
(the routed rung is 25 times the cheapest here, so counts understate the saving).
I ran the replay before writing the log entry, so no prediction was on record.
Log and data: [`LOG.md`](../../research/verified-dse/LOG.md), milestone 10.
