---
title: "Is the gentler halving cut a real gain for chip-flow search? A leave-one-design-out test"
date: 2026-10-25
description: "Choosing the successive-halving cut on other designs: it helps on larger designs, and the 'bias floor' reported earlier belongs to the aggressive cut."
tags: [research, verified-dse, multi-fidelity, sky130]
---

An earlier step of the [verified-dse](../../research/verified-dse/README.md)
programme found, almost by accident, that halving by 2 rather than 3 between
cheap rungs of an open chip flow did better than random search in several cells.
It was one of two variants tried, so this step tests it out of sample: sweep the
cut eta over 1.5 to 4, choose it on all designs but one, score it on the one left out.

What came back (400 paired seeds, cached flow runs, no new flow run):

- On ten small designs the held-out choice beats random search only narrowly at
  the tight clock (20 and 30 s) and loses at 45 s and at the relaxed clock.
- On five larger designs at the relaxed clock, the chosen cut (1.5) beats random
  search from 200 s on, with regret 0.40% against 2.03% at 400 s. The 5% "floor"
  we had reported for halving by 3 belongs to that aggressive cut.
- Limits: 1.5 is the edge of the grid, three of the five larger designs are one
  family, and part of the gain may be "filter on a mid rung, then route" rather
  than multi-fidelity ranking. The next step separates those.

Log, script and results: `research/verified-dse/LOG.md`, Milestone 12.
