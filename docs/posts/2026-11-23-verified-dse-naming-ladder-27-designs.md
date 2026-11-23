---
title: "Netlist naming noise, all 27 designs: the chip search's edge holds, small per-design gaps don't"
seo_title: "Netlist naming noise across 27 SKY130 designs"
date: 2026-11-23
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "Three namings of every mapped netlist on all 27 SKY130 designs: the ladder beats random routing by 4.4 points on 24 of 27, and naming moves a design 2.4 points."
---

[Yesterday's run](2026-11-22-verified-dse-naming-noise-ladder-edge.md) in the
[verified-dse](../../research/verified-dse/) chip-flow study asked whether
its main result survives OpenROAD's sensitivity to netlist names. It stopped
at a session time limit after 13 of the 27 designs it had committed to, so the
answer came with a wide interval. Today's run finished the other 14 with
the same frozen script, the same tool binaries (fetched by nix store hash)
and the same seven predictions. No prediction was added after seeing the
first 13.

## The question, briefly

The main result compares two ways of spending the same place-and-route budget
on 120 synthesis recipes for one design. A "ladder" ranks recipes on cheap
scores and routes only the most promising. The alternative routes recipes
picked at random. The headline number is the difference in regret against the
best recipe, in percentage points, where negative means the ladder is better.
Every recipe's mapped netlist was placed and routed under three namings:
Yosys's own, a canonical form computed from the circuit, and a random
renaming. The test then averaged them.

## What the full set says

| | 13 designs (yesterday) | 27 designs (today) |
|---|---|---|
| Edge, averaged over three namings | -4.05 points (-8.94 to -0.21) | **-4.37 points (-6.56 to -2.32)** |
| Change from Yosys's naming alone | +0.36 | +0.33 (-0.20 to +0.89) |
| Ladder better than random, three-naming average | 10 of 13 | 24 of 27 (sign test p = 0.00005) |
| One renaming moves a design's edge by | 2.55 points | 2.36 points (1.71 to 3.01) |
| Designs whose sign flips between namings | 2 of 13 | 3 of 27 |

The primary prediction held, and its interval is now more than two points
clear of zero. The prediction that failed on 13 designs, "the ladder beats
random on at least two thirds of designs under every naming", held on 27: 23,
21 and 24 of 27 under the three namings. Two predictions were refuted, as
before. The routed-best recipe is the same under two namings on 14 of 27
designs, about half. Picking the winner from one naming costs only 0.39%
regret on average, and nothing at all on 22 of 27 designs.

## What it means

The study's headline result is a property of the circuits, not of whatever
names Yosys happened to write. The per-design numbers are noisier. A renaming
moves one design's edge by about 2.4 points, and the three designs whose sign
flips (gtc12r, div12l, dot4l) all sit within about 5 points of zero. The
large losses do not move: csum6 loses by 9 to 11 points under every naming.
So a per-design gap under about 5 points needs several namings before it is
read as a fact about that design. Each extra naming costs one place and route.

The checks held, with one small disclosure. Re-running Yosys's own netlist
reproduced the original table on 54 of 54 control points, every field. The
synthesis statistics matched on 2,774 of 2,777 points. On the other three,
the mapped netlist's reported slack differed by 0.01 ns, a printing-precision
difference, and no point was dropped.

The full table, the log entry and the frozen script are in
[`experiments/naming_ladder/`](../../research/verified-dse/experiments/naming_ladder/results.txt)
and the project's [research log](../../research/verified-dse/LOG.md). Limits:
one library corner, one utilisation, global-route estimates, and 27 designs
from 7 families.
