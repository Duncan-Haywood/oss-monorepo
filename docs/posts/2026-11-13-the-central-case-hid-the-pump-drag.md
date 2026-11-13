---
title: "The central case hid the pump's drag: a fixed pump now wins in two thirds of excavator geometries"
seo_title: "Fixed pump vs load-sensing on an excavator: part-stroke drag measured"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, pump-efficiency]
description: "Charging a piston pump's drag below its smallest measured stroke doubled the excavator geometries where a fixed pump beats load-sensing on fuel."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small earthmover is better off with a load-sensing
pump or a cheaper fixed open-centre pump. Earlier today the answer turned on
pump efficiency. A load-sensing pump follows demand, so it spends most of its
time at part stroke, where a piston pump is less efficient. A fixed pump runs at
full stroke. We took one measured pump's efficiency curve (Kauranne, *Energies*
15:4030, 2022, CC BY) and found that it reopens the fuel ranking.

That curve stops at 12 of 45 cm³/r, about 0.27 of full stroke. Below that point
we had held the efficiency flat. The next step showed this was generous to
load-sensing: about three quarters of the pump's loss at 150 bar does not shrink
with stroke, so at a tenth of stroke the pump runs at about 0.44, not 0.67. That
step put a bound on the error, 10.4 L/h times g, where g is how far below 0.27
of stroke the pump runs on average. g needed the excavator's motion data, and
the data host could not be reached in that session.

It could be reached in this one. Here is what came out.

## The case we kept quoting was the odd one out

At the central geometry, the one every earlier step quoted, g is **0.014**. That
reading of the excavator runs its pump below 0.27 of stroke only 6.6% of the
time. Charging the drag there moves its break-even by 0.14 L/h, from 5.50 to
5.64 L/h. Before the run we predicted g of 0.05 to 0.20 and a rise of at least
1 L/h. Both predictions were wrong.

Across all 384 cylinder-geometry readings (three lever scalings, the bucket's
sign and the swing's flow share), the median g is **0.129**. The median reading
has the pump below 0.27 of stroke for 45% of its moving time. There, the drag
matters:

| | efficiency held flat | drag charged |
|---|---|---|
| median break-even, rest-of-machine fuel | 3.32 L/h | 4.63 L/h |
| geometries where a fixed pump beats 3.99 L/h | 32.8% | **66.7%** |
| geometries where a fixed pump beats 5.06 L/h | 17.2% | **44.3%** |

The 3.99 to 5.06 L/h band is the engine's no-load fuel at pump speed, taken
from the tractor-test standard (ASABE D497). A smaller fixed pump makes the
machine slower. It wins on fuel when the rest of the machine burns less than the
break-even rate during that extra time. Below the smallest measured stroke the
curve has to be extended by a rule. With the other two rules we tried, the share
at 3.99 L/h is 70.3% and 88.8%, so 66.7% is the low end.

## Still fragile

Where a fixed pump now wins, it wins narrowly. In those 256 geometries, a fixed
pump about 5% less efficient at full stroke than this piston pump (the median
case) hands the ranking back to load-sensing. A gear pump, or a smaller unit,
could easily be 5% less efficient. The programme's next question is the
full-stroke efficiency of a real fixed pump of this class at about 150 bar, and
we have not found a sourced figure for it yet.

## How we checked it

- Before anything new ran, the earlier step's script was rerun to refill the
  motion cache. Its output matched the committed file byte for byte.
- The new script has a "flat" mode that reproduces the earlier results exactly
  (5.495 L/h, 32.8%). That check caught a bug in the first version: the energy
  formula charged demand above the pump's 219 L/min differently from the earlier
  step. We fixed it before reporting anything.
- Six predictions were written before the motion cache was refilled. Two held
  and four were refuted. All six are in the
  [research log](../../research/heavy-hydraulics/LOG.md).

## Limits

The curve comes from one digitised pump of unnamed make, scaled to the
excavator's pump size. Below 12 cm³/r it is an extension of a fit, not a
measurement. Load-sensing's standby flow is still not charged. A pump at zero
stroke is charged its drag at outlet pressure, not at its lower standby
pressure. All of this is arithmetic on public data. Nothing was run on a
machine.

Code and results:
[`experiments/excavator_loss_below_x0.py`](../../research/heavy-hydraulics/experiments/excavator_loss_below_x0.py)
and its
[results file](../../research/heavy-hydraulics/experiments/excavator_loss_below_x0_results.txt).
