---
title: "Does keeping more points at the last cut make a design-search guarantee possible?"
seo_title: "Successive halving certificate: larger final keep, chip design search"
date: 2026-11-09
tags: [research, verified-dse, successive-halving]
description: "In 20 three-rung chip design-search cells, raising the final keep from 1 to 8 gives a certified point in only 7."
---

The verified-dse programme asks when a cheap-to-expensive search over chip
designs can come with a guarantee about the answer it returns. Yesterday's
result was that, with three fidelity rungs, none of 20 cells had even one
point that could be certified, because the last cut kept a single point.

The obvious fix is to keep more points at the last cut. I wrote down three
predictions first and counted exactly on the cached 40-cell table, no flow run:

- More keep never removes a certified point. Held in every cell.
- At a final keep of 2, fewer than 5 of 20 cells have a certified point. Held (2 of 20).
- At a final keep of 5, at least 15 of 20 do. **Refuted**: 6 of 20.

Cells with a certified point at final keep 1, 2, 3, 5, 8: 0, 2, 6, 6, 7 of 20.
For 13 of 20 cells no final keep up to 8 helps, so the middle cut or the rung
scores themselves are the limit. The cheaper route to a guarantee stays what
the previous result said: plan the ladder, dropping the cheapest rung.

Limits: one pool size (n = 50), one halving factor, only the last keep varied,
and certification only; the regret and cost of keeping more were not run.
Code and results: `research/verified-dse/experiments/theory/pilot_cert_keep.py`.
