---
title: "Can a few routed probes tell you the cheap estimate is safe to cut on?"
seo_title: "Pilot check for rank displacement in chip-flow search"
date: 2026-11-05
tags: [research, chip-design, optimisation, negative-result]
description: "A routed pilot of 16 points flags the safe-to-cut cases in 70% of the guaranteed cells, with about 4% false alarms, on SKY130 designs."
---

In the `verified-dse` programme, successive halving that cuts on a cheap score loses nothing if fewer rivals rank ahead of the true best than the cut keeps. The catch: you cannot see the true best's rank without routing everything. But the cheap scores are known for the whole pool, so the rank of any *routed* point is exact.

Milestone 84 asks whether the rank of a pilot's best routed point stands in for the optimum's. It uses the 40 cached group-rung cells, 300 random pilots per cell, no new flow run.

- The pilot-best point's ratio is at least the optimum's in a median 89%, 97% and 99% of pilots at 8, 16 and 24 routed points.
- Calling "ratio below 1" a certificate marks 70% of pilots at 16 points in the 11 cells where the optimum really meets the zero-regret condition, and 3.9% of pilots in the 29 where it does not.

Two of my three predictions were wrong (coverage was higher than guessed, and using the best three points covers less, not more). This is evidence on one table of ten small designs, not a theorem. Data and script: `research/verified-dse/experiments/theory/pilot_rho_results.txt`.
