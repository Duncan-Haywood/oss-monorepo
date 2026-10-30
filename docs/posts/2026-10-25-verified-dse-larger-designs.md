---
title: "Does a cheap chip-flow rung pay once routing is expensive? Five larger designs, 600 runs"
date: 2026-10-25
description: "On ten small designs an open chip flow's cheap rungs did not beat random search. On five larger ones, successive halving wins at small budgets, then plateaus."
tags: [research, verified-dse, openroad, multi-fidelity, sky130]
---

The [verified-dse](../../research/verified-dse/README.md) programme asks when a
cheap fidelity rung (generic gates, liberty mapping, placement) can stand in for
a routed SKY130 run when searching over ABC pass sequences. On ten small designs
the answer was "not at equal wall-clock": a routed point cost 1.3 s against 0.15 s
for the cheapest rung, so there was little to save.

This run adds five larger designs (16, 24 and 32-bit multipliers, 64-bit adders),
the same 60 pass sequences and two clock targets: 600 runs with Yosys 0.33 and
OpenROAD 26Q2 (the nixpkgs binary cache). A routed point now costs 19.4 s against
0.77 s, 25 times the cheapest rung.

What came out, replayed at equal wall-clock on the cached table:

- At the tight clock, successive halving from the mapped rung reaches 1.34% mean
  routed regret at 100 s against 4.44% for random routed search, and 0.33% against
  1.85% at 200 s.
- Random search overtakes it from about 600 s, because halving stops at a 0.30%
  floor of rung bias. At the relaxed clock it wins only at 100 s.
- Halving from the generic rung loses everywhere.
- Two of my three predictions were wrong in detail: the generic rung is weakly
  informative on multipliers, and mapped rungs mis-rank the big multipliers at the
  relaxed clock, the opposite of the small-design result.

Five designs, pools of 50 and one corner, so this is a first sign, not a result.
The log with the predictions made before the run is in
[`LOG.md`](../../research/verified-dse/LOG.md).
