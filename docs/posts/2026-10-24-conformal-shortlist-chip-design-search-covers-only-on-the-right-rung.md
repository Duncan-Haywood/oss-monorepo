---
title: "A conformal shortlist for chip design search works on the mapped rung and fails on the generic-gate one"
seo_title: "A conformal shortlist for chip design search: where it covers"
date: 2026-10-24
description: "A conformal bound on a routed pilot keeps the best SKY130 design 99% of the time at about half the routed runs, but only if the cheap rung is a mapped netlist."
tags: [research, eda, conformal, chip-design]
---

Can a statistical guarantee make a cheap proxy safe in chip design search?
In the `verified-dse` programme we replayed 20 design-by-clock groups
(10 small designs, about 50 ABC pass sequences each, run through Yosys,
ABC and OpenROAD on SKY130) and asked: if a 10 to 16 point routed pilot
calibrates a one-sided conformal bound on routed area x delay, does the
shortlist still contain the best point at the stated rate?

**Result.** With the mapped-netlist rung, the optimum was kept 0.99 of the
time at a nominal 0.90 (0.90 to 0.92 at nominal 0.80), routing 42 to 57% of
the pool; random search with the same number of routed runs found it 0.53 to
0.65 of the time. With the generic-gate rung, coverage was 0.65 at nominal
0.80, no better than random search of equal cost. The per-point guarantee
does not transfer to the argmin, which is selected for having a low residual.

**Caveats.** One corner, 20 groups from ten small designs, wide intervals,
global-route estimates rather than detailed routing. No theory yet for the
undercoverage. The code (`experiments/conformal/replay.py`, 35 s, no flow
re-run) and the log with the plan written before the run are in
`research/verified-dse`. Written with AI assistance.
