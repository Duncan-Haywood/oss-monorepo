---
title: "The first cut, not the rung scores, blocked a design-search guarantee"
seo_title: "Successive halving certificate: first keep, chip design search"
date: 2026-11-09
tags: [research, verified-dse, successive-halving]
description: "Correcting yesterday: widening the first keep certifies 18 of 20 three-rung chip design-search cells, against 8 with the first keep at a third of the pool."
---

Yesterday's post said that even the widest middle and final cuts left 12 of 20
three-rung search cells with no certifiable point, and blamed the cheap rung
scores. That was wrong, and the cause was a setting I had not varied: the first
cut kept only a third of the pool (16 of 50 points).

Varying it, with exact counting on the cached 1,200-run table and no new flow
runs, the number of cells with at least one certified point goes 6, 8, 12, 18,
18 as the first keep grows 8, 16, 25, 35, 50 (with a middle keep of 16 and a
final keep of 8). The predictions I wrote first, that the first cut stops
binding by 35 and that at most 8 cells would certify, were both refuted; only
monotonicity held. The two cells that never certify are the ripple adder at
both clocks, whose routed scores take four distinct values.

The catch is cost. Keeping 35 of 50 points at the cheapest rung saves little
over scoring everything at the next one, which matches the earlier advice to
drop the cheapest rung. Whether a wide first cut beats the two-rung ladder in
wall-clock is the next step. Everything is in `research/verified-dse/`
(milestone 103 in `LOG.md`).
