---
title: "The other side of the cut: 12 deep-amount shifters rerouted under fresh netlist names"
seo_title: "12 deep-amount shifters rerouted under fresh netlist names"
date: 2026-11-24
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "4,992 SKY130 place-and-route runs: the gate-depth guard's 11 wins and 1 loss above 32 gates all survive two fresh netlist namings."
---

The [verified-dse](../../research/verified-dse/) study searches synthesis
recipes for a chip with a clipped ladder: cheap synthesis scores first, then
routing only for the survivors. A guard decides when to trust the ladder.
When fewer than 32 gates of logic feed a shifter's shift amount, the guard
routes at random instead. Its evidence was 25 decided blind designs: 11 wins
and 1 loss above the cut, 5 wins and 8 losses below it.

Every one of those 25 numbers came from a single naming of the mapped
netlists. Renaming nets and instances changes OpenROAD's placement, and on
these designs that can move a per-design result by several points.
[Earlier today](2026-11-24-verified-dse-shifter-namings-hold.md) milestone
166 rerouted the 13 below the cut under two fresh namings, and all of them
held. Milestone 167 does the other side, the side that justifies the guard.

## The run

All 12 decided designs at 32 gates or more were rerun. Each sequence was
mapped again with the same Yosys 0.70 build, fetched from the Nix cache by
hash. Two fresh random renamings of every netlist were then placed and routed
at both clocks with the same OpenROAD 26Q3 executable: 4,992 runs in 106
minutes on four cores, one of which failed. Re-placing Yosys's own netlist
reproduced the committed rows on 48 of 48 control runs, every field. Seven
predictions were committed before the flow started. All seven held.

| | wins | losses | ties | mean edge (points) |
|---|---|---|---|---|
| original naming | 11 | 1 | 0 | -6.34 |
| fresh naming R2 | 10 | 1 | 1 | -6.24 |
| fresh naming R3 | 10 | 1 | 1 | -6.36 |
| average of three | 11 | 1 | 0 | -6.31 |

The edge is the ladder's regret minus that of random routing at the same
cost. Negative means the ladder is better.

## What it says

The deep-side wins are real. Averaged over three namings, all 11 stay wins,
from -5.11 points (fib14) to -19.29 (max3b6). The one loss, a 36-gate packed
multiplier feeding the amount, stays a loss at +16.05. That is still 11 to 1,
a sign-test p of 0.0063.

The more striking number is the ladder's own regret. On all 11 wins it is
exactly zero under the three-naming average, and under each fresh naming it
is zero on 10 of 11 (the exception, mul2w, reached 0.34%). Whichever naming
routes the pool, the ladder finds the best routed sequence. What renaming
moves is how unlucky random routing is: on cmp48 its regret is 5.6%, 9.9%
and 6.6% under the three namings.

These designs are also steadier than the shallow ones. One fresh naming moves
a deep design's edge by a median 2.05 points, against 3.51 below the cut,
where several 128-bit shifters with long wires swing far more.

Both sides of the guard are now measured under three namings: 11 to 1 above
32 gates, 5 to 8 below. What the reruns cannot do is place the cut. Any cut
from 19 to 32 gates misplaces 5 or 6 of the 25 decided designs, so 32 is a
conservative choice rather than a fitted boundary. It gives up some real
shallow wins in exchange for insurance against real shallow losses.

Limits: three namings per design, one of them Yosys's; one corner, one
utilisation, global-route estimates; the 18 tied designs above the cut were
not rerouted. Code, flow table and results:
[`experiments/naming_above/`](../../research/verified-dse/experiments/naming_above/results.txt).
