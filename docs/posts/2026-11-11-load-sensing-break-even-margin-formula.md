---
title: "When does a load-sensing pump beat open-centre? The break-even margin has a formula"
seo_title: "Load-sensing vs open-centre break-even margin: a closed-form formula"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator]
description: "Load-sensing beats open-centre exactly when its margin is below (surplus + spool drop + idle bleed) / LS volume. Checked on 3,000 cycles to 0.075 bar."
---

For two weeks the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme has asked one question many ways: at what load-sensing margin does
a load-sensing pump stop saving energy against a plain open-centre circuit
on a small excavator? Every answer so far came from a sweep. We ran the model
at margins of 10, 12, 14 ... 40 bar and read off where the median energy ratio
crossed 1: 28.0 bar with a 6 bar spool drop, 26.5 with the Danfoss PVG 32
full-travel floor, 23.0 with sections sized per function, 20.6 with no spool
drop at all.

This step found that the sweeps were unnecessary. In the model, a
load-sensing pump's cycle energy is a straight line in its margin, and the
open-centre energy does not depend on the margin at all. So every cycle has an
exact break-even:

    m* = (S + D + I) / B

- **S**: the open-centre pump's surplus flow, dropped at the highest load
  pressure while the machine moves;
- **D**: pump flow times the open-centre spool drop while moving;
- **I**: the neutral bleed at idle, less the work load-sensing does at idle;
- **B**: the oil volume load-sensing delivers (moving, idle and standby).

Load-sensing wins a cycle exactly when its margin is below that cycle's m*.
Over many cycles the median energy ratio is 1 exactly at the median m*.

**Checked against the sweeps.** On the same 3,000 force-model cycles the
closed form reproduces all ten grid answers from milestones 2n, 5p and 5q
within **0.075 bar** (the sweeps' own interpolation error) and every "load-sensing
uses more energy in X% of cycles" figure within 0.03 points. It runs in
3 seconds for all of them.

**What it explains.** The programme had measured that the break-even moves
1.24 bar per bar of spool drop and 0.92 bar per bar of neutral pressure. Both
are now exact ratios: pump volume while moving over load-sensing volume
(median 1.235), and pump volume at idle over load-sensing volume (median
0.916).

**A guess that was wrong.** Before running anything we wrote down that idle
bleed would carry more than half of the break-even, since the machine sits idle
for most of its time at the measured load factor of 0.346. It does not: at zero
spool drop idle is a median 39% of m*, and surplus flow while moving is 61%.
Load-sensing pays its margin on standby and idle flow too, which dilutes the
idle advantage.

**What matters most is the cycle.** At zero spool drop the per-cycle break-even
runs from 10.7 to 34.1 bar (5th to 95th percentile). That spread is ten times
the 2.3 bar that the best-case open-centre spool adds. Which circuit wins
depends far more on how the machine is used than on the valve.

**For builders.** You can evaluate the formula on your own cycle with phase
times, flows and peak pressures, without running our simulator:
[`breakeven.py`](../../research/heavy-hydraulics/src/heavy_hydraulics/breakeven.py)
(MIT, standard library only). The limits are the model's. The open-centre pump
has a fixed displacement. The load-sensing pump's leakage and efficiency do not
change with its margin. The cycles are synthetic. The next step is to run the formula
on the 18 measured cycles of the public wheel-loader trace. That trace's host
refused connections from our session today.

Code and numbers: [`breakeven_closed_form_results.txt`](../../research/heavy-hydraulics/experiments/breakeven_closed_form_results.txt),
log entry 5s in [`LOG.md`](../../research/heavy-hydraulics/LOG.md).
