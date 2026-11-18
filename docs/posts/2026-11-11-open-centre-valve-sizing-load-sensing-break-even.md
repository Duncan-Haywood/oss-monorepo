---
title: "Sizing open-centre valve sections per function moves the load-sensing break-even to 23 bar"
seo_title: "Open-centre valve sizing and the load-sensing break-even margin"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator]
description: "Sized per function, open-centre spools drop 2.3 bar and the load-sensing break-even falls to 23 bar. Below 20.6 bar, load-sensing beats any open-centre valve."
---

Earlier today the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme put a floor under the open-centre spool drop. A fully open spool
passes the most flow it can for a given drop, so the drop while it feeds a
cylinder can be no smaller than that
([previous post](2026-11-11-least-spool-drop-open-centre-valve.md)). That step
gave each actuator, in each phase, the smallest Danfoss PVG 32 spool that
covers its flow. The surprise was that spool size mattered more than anything
else. One size up moved the break-even load-sensing margin by about 4 bar.

**Machines don't pick spools per phase.** A valve section is chosen once per
function (boom, arm, bucket, swing), big enough for the most flow that function
will ever have to pass. In the light phases it then runs well below its rating,
and its floor drop is small. This step sizes the sections that way. Boom,
bucket and swing get a D spool (65 L/min rated) because each can take the whole
45 L/min pump on its own. The arm, which only works during digging at half the
flow, gets a B. We wrote down five predictions before running it, and all five
held.

| Open-centre drop while a section moves | Break-even LS margin |
|---|---|
| constant 6 bar, measured on another machine's block | 28.0 bar |
| PVG 32 floor, sized per phase | 26.5 bar |
| PVG 32 floor, sized per function to each cycle's peaks | 25.6 bar |
| PVG 32 floor, sized per function for its largest possible flow | 23.0 bar |
| no drop at all | 20.6 bar |

A load-sensing machine whose margin is below the break-even uses less pump
shaft energy than the open-centre one on these cycles. Each bar of open-centre
drop raises the break-even by 1.24 bar.

**What it settles.** The last row is the useful one. However an open-centre
section is sized and however its bypass closes, the break-even can't go below
about 20.6 bar in this setup (the PVG 32 neutral drop, a 0.346 load factor, a
2 L/min standby flow). So a load-sensing pump set to the 14 bar standby
Rexroth's manual gives wins against any open-centre valve here.

**What it leaves open.** The 25 bar margin from a thesis model, and the 24.9 bar
we measured on a real 6 t wheel loader, both fall inside the 23.0 to 25.6 bar
band that the two per-function sizing rules span. In that band the answer
depends on how much a real spool drops at partial lever, above its floor. That
needs the manual's spool-travel curves or a measured open-centre machine. A
tighter floor can't answer it.

**Caveats.** The cycles come from a force model, not a measured excavator. Which
function works in which phase is our reading of the phase names. No time
penalty is charged, and an earlier step showed that charging one moves the
break-even 6 to 11 bar against open-centre. The full results are in
[`spool_function_sizing_results.txt`](../../research/heavy-hydraulics/experiments/spool_function_sizing_results.txt).
This is simulation and arithmetic, not a machine design. The analysis was done
with AI assistance.
