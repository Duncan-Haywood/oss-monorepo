---
title: "A learned score does not fix the worst mis-ranked chip-flow design"
date: 2026-10-26
description: "Ridge scores fitted on 19 designs and held out by design match the hand-made area-delay scores; barrel64 stays at 82% regret."
tags: [verified-dse, research, eda, multi-fidelity]
---

In the verified-dse programme, the cheap synthesis-stage score (R2) mis-ranks
one design badly: its pick for `barrel64` costs 82.7% more area-delay product
than the best point after routing. Milestone 19 asked whether a score fitted on
the other 19 designs, from columns already in the tables, would fix that.

It does not. Ridge regressions over R2 features, R2 plus Yosys cell count and
depth, R3 features, and R2 plus R3, all held out by design, land within 0.7
points of the hand-made scores on mean regret (hand R2 7.69%, best learned R2
variant 6.99%, hand R3 4.77%). The worst cell stays at 82 to 87% for every
R2-based model, even when the fit is in-sample. The only thing that has removed
it so far is using the period from the placement stage (R3).

One caveat: I ran the script once before writing the log entry, so the result is
post hoc and the log says so. It uses 20 designs, 40 correlated cells, one
tool version, and no flow run. The next step needs OpenROAD to get a
repairability feature. Log: `research/verified-dse/LOG.md`, milestone 19.
