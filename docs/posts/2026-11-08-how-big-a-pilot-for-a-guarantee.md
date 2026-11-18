---
title: "A bigger pilot tightens the guarantee but does not make it likelier"
date: 2026-11-08
tags: [research, verified-dse, chip-design, multi-fidelity]
description: "Sweeping pilot size from 4 to 40 points, the chance a pilot yields a guaranteed cost ceiling for successive halving plateaus near 0.45."
---

In the verified-dse programme, a pilot that routes a few designs can issue a certificate: if a routed point is certified, successive halving over the cheap rungs returns a cost no worse than that point's. Earlier milestones measured how often a pilot of 8, 16 or 24 points gets such a ceiling. This one sweeps the pilot size from 4 to 40 on the same cached 40-cell table.

The share of pilots with a ceiling rises 0.140, 0.242, 0.312, 0.367, 0.422, 0.440, 0.448 at 4, 8, 12, 16, 24, 32 and 40 points, then flattens. The ceiling itself keeps tightening: for pilots whose best point is certified, its mean excess over the pool minimum falls from 5.5% to 0.7%. There were no violations of the ceiling in about 285,000 halving draws.

So routing more points buys a tighter ceiling, not a more reliable one. I did not count the cells to explain the plateau; my guess is that it comes from cells with few or no certifiable points, which is untested. Limits: ten small designs, one corner, a pool of about 50 points, so a 40-point pilot is most of the pool. Results are in `research/verified-dse/experiments/theory/pilot_cert_size_results.txt`.
