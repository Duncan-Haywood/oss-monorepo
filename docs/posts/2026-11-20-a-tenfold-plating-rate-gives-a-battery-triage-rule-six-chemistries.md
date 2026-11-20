---
title: "A tenfold plating rate gives a battery triage rule six chemistries, and an interval that excludes zero"
seo_title: "PyBaMM plating-rate sweep: triage rule across six chemistries"
date: 2026-11-20
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "Scaling only the plating exchange current of PyBaMM's Mohtat2020 and Ecker2015 cells by 10 makes them fade, and moves a triage rule's saving off zero."
---

The [cell-fidelity programme](../../research/cell-fidelity/) has a rule for battery design
searches: simulate every design for ten cycles, and only run the risky ones on to cycle 50.
On four PyBaMM parameter sets it was cheaper than a fixed run length on 14 of 20 held-out
folds. Bootstrapped over the four chemistries, though, its average saving ran from
&minus;8.5 to +0.25 cycles per design. That interval includes zero, so the paper could not
say the saving holds across chemistries.

Two earlier runs looked for more chemistries and found none usable. Three of PyBaMM's unused
cells barely lose lithium under the programme's protocol: `Mohtat2020` and `Ecker2015` lose
about 0.5% of their cyclable lithium from cycle 2 to 20, against 4.8 to 17% on the four sets
in use. The fourth, `Ramadass2004`, has
[poles inside its cathode potential fit](2026-11-20-a-pole-inside-pybamms-ramadass2004-cathode-fit.md).

## One lever, fixed before the run

Almost all the lithium these cells lose goes to plating, so today's run scaled one thing:
the plating exchange-current density. `Mohtat2020` ships it as a constant (1e-3 A/m²).
`Ecker2015` ships O'Kane's form, F·k·c<sub>e</sub>, with k = 1e-10 m/s, ten times below
the `OKane2022` value the other sets borrow. That also corrects a caveat in an earlier
step, which said every set ran on `OKane2022`'s degradation parameters. The protocol only
copies the keys a set lacks.

The ladder was written down before any probe ran: multipliers of 3, 10, 30 and 100. For each
cell the run kept the smallest multiplier at which four probe designs lose 3 to 20% of their
lithium from cycle 2 to 20. With the multiplier at 1, the wrapper reproduced the earlier
probe on all eight designs exactly.

| multiplier | Mohtat2020 fade | Ecker2015 fade |
|---|---|---|
| 1 (earlier run) | 0.48% | 0.53% |
| 3 | 1.4% | 1.6% |
| **10 (kept)** | **4.2%** | **5.0%** |
| 30 | 10.7% | 12.0% |
| 100 | 23.7% (over the cap) | 22.5% (over the cap) |

Lithium loss rises a little less than in proportion to the plating rate: the log-log slope
is 0.85 and 0.81.

## What the six sets say

All 112 benched designs ran to cycle 100. On `Ramadass2004`, 11 of 56 had failed in the
solver. The ten-cycle lithium-loss forecast that the rule depends on works on both new cells.
Its 75th-percentile error is 0.074 on `Mohtat2020` and 0.201 on `Ecker2015`. The four
committed sets sit at 0.06 to 0.12, and `Ramadass2004` at 12.6.

Put through the same code as the four committed sets, the threshold rule's saving against
a uniform run length is now **3.73 cycles per design, with a set-clustered bootstrap
interval of &minus;6.94 to &minus;0.57**. That is the first interval in the programme that
excludes zero across chemistries. The sign test over 30 folds is 17 cheaper and 6 dearer
(p = 0.035).

## The caveat that goes with it

On `Mohtat2020` the threshold rule met its tail target on only 2 of 5 folds. A uniform run
length met it on 3. Both missed the same two pools. The rule also missed a third, where it
saved 5 cycles by stopping at 45 cycles while uniform ran to 50. Over all 30 folds the rule
meets its target on 26 and the uniform rule on 27, so a small part of the saving is a miss.
The plan's hypothesis that the rule meets its target on at least 4 of 5 folds on every new
cell is refuted.

The other qualification is in the method. The two new sets are tuned cells: each keeps its
chemistry's potentials and transport, with a plating reaction ten times faster than
published. What the run shows is breadth over electrode chemistry at matched fade. It does
not show breadth over cells whose plating rate nobody chose.

Next: why both rules' margins miss on `Mohtat2020`, and the same check at a multiplier of
30, so the interval is not a property of one step of the ladder. The numbers are in
[`experiments/plating7r/results.txt`](../../research/cell-fidelity/experiments/plating7r/results.txt),
and the plan was committed before the probe ran, in the
[log](../../research/cell-fidelity/LOG.md).

**Update, same day:** the check at a multiplier of 30 failed. The six-set interval goes back
across zero (&minus;6.19 to +3.75), and on the tuned cells the rule is dearer than a uniform run
length. See [the follow-up](2026-11-20-the-battery-triage-interval-did-not-survive-a-second-plating-rate.md).
