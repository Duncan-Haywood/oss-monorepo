---
title: "A pole inside PyBaMM's Ramadass2004 cathode fit, and why it stopped us adding a fifth battery chemistry"
seo_title: "PyBaMM Ramadass2004 LiCoO2 OCP has poles inside 0 < y < 1"
date: 2026-11-20
tags: [battery-simulation, pybamm, research, cell-fidelity, reproducibility]
description: "PyBaMM's Ramadass2004 LiCoO2 potential is a rational fit with three poles inside 0 < y < 1, one at y = 0.889. How it broke a forecast, and a check for it."
---

The [cell-fidelity programme](../../research/cell-fidelity/) has a rule for battery design
searches: simulate every design for ten cycles, and only run the risky ones on to cycle 50.
On four PyBaMM parameter sets the rule was cheaper than a fixed run length on 14 of 20
held-out folds. But bootstrapped over the four chemistries, its average saving still
included zero. More chemistries was the obvious next step.

Yesterday's run looked for a fifth set. Only one of PyBaMM's unused cells, `Ramadass2004`,
lost lithium fast enough to test. On it, the ten-cycle forecast that the rule depends on
failed badly: the 75th-percentile error was 12.6, against 0.06 to 0.12 on the other four.
That run guessed the cathode's open-circuit potential table was the cause, because it
"changes direction 7 times". Today we checked.

## What the table is

The table matches PyBaMM 26.10.1.1's `lico2_ocp_Ramadass2004` to 5e-8 V. That function is
a degree-10 rational fit, a polynomial divided by a polynomial, evaluated at
`1.13 * sto`. PyBaMM's docstring says the 1.13 "stretch" is the anode-to-cathode area
overhang. The denominator is zero at three stoichiometries inside 0 < y < 1:
**y = 0.245, 0.374 and 0.889**. Next to each pole sits a zero of the numerator (0.249,
0.372, 0.887), so each spike is narrow: the last pole-zero pair is 0.0016 wide. In the fit's
own variable (t = 1.13 y), that last pole is at t = 1.004, just outside the range the fit
covers. The stretch is what pulls it inside, into the part of the curve a LiCoO2 cell
cycles through.

## What the simulated cells did

We guessed that each charge would stop just above the pole, where the voltage shoots up.
That guess was wrong. Cycle 2's charge ended anywhere from y = 0.61 to 0.97, and 23 of the
45 designs finished below the pole. What does hold is that the band is narrow. The cells
charge a median 9.8% of their cathode per cycle, against 28 to 44% on the four committed
sets. Our reading, which we have not tested, is that the spike is too narrow for the
solver's steps to resolve, so the simulation sometimes steps over it.

## Can the forecast be repaired?

We tried two repairs, and neither brings the forecast up to the other four sets'
accuracy:

| table the forecast law reads | cycle-10 error, q75 |
|---|---|
| PyBaMM's, as shipped (7p) | 12.6 |
| running maximum from y = 1 (planned repair) | 0.90 |
| spikes bridged linearly (post hoc) | about 12.4 |
| the four committed sets, for reference | 0.06 to 0.12 |

The envelope helps the cells that stop above the pole and misleads the ones that cross it.
We added the repaired cell as a fifth set anyway, as the plan said we would. The threshold
rule then cost 8.4 cycles per design *more* than the fixed run length, and the
across-chemistry interval widened to -7.53 to +3.81 cycles. So the paper keeps four sets.
It now excludes `Ramadass2004` for a reason anyone can check: the cell that gets simulated
comes from the fit, not from a cell anyone would build.

## A check worth running before you benchmark

If you compare methods across PyBaMM's parameter sets, check every rational OCP fit for sign
changes of its denominator on 0 to 1 before you trust a result on it.
`experiments/poles7q/run.py scan` does this with the standard library only. It also counts
direction changes in every tabulated OCP. Of the eight cells this programme has tabulated,
`Ramadass2004` is the only one whose cathode table is not monotone.

One limit: we checked a single PyBaMM version and did not search the upstream tracker. If
the stretch is meant to apply somewhere other than inside the fit, the fix belongs upstream.
Plan, results and caveats: the programme's
[log](../../research/cell-fidelity/LOG.md) and
[results](../../research/cell-fidelity/experiments/poles7q/results.txt).
