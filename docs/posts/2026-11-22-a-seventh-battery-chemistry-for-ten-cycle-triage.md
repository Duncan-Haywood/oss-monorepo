---
title: "A seventh battery chemistry keeps ten-cycle triage cheaper, and costs it accuracy"
seo_title: "Battery DFN triage on a seventh chemistry: cheaper, less accurate"
date: 2026-11-22
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "Adding PyBaMM's Marquis2019 cell as a seventh chemistry keeps ten-cycle DFN triage cheaper than a fixed run length, but it meets fewer accuracy targets."
---

The [cell-fidelity programme](../../research/cell-fidelity/) asks how much full-model (DFN)
simulation a battery electrode design search can skip. Its answer so far is a triage rule. Each
design runs ten DFN cycles in PyBaMM, a straight-line law forecasts the lithium lost by cycle 99,
and only the designs a drift score flags run on to cycle 50. On four published parameter sets the
rule beats a uniform run length on 14 of 20 held-out folds. Bootstrapped over the four sets, though,
its mean saving runs from &minus;8.5 to +0.25 DFN cycles per design. So breadth across chemistries
is what limits the claim.

## The last stock cell

PyBaMM ships only one more cell that the programme's design mapping accepts and whose voltage
curves are well behaved: `Marquis2019`, a Kokam pouch cell. Under the protocol it barely ages. It
loses 0.16% of its cyclable lithium from cycle 2 to 20, against 4.8 to 17% on the four committed
sets. Milestone 7r had brought two other quiet cells into range by scaling one parameter, the
plating reaction rate, along a ladder fixed in advance (3, 10, 30, 100). Milestone 7z ran the same
code on `Marquis2019`, with the plan committed before any run:

- At f = 1 the wrapper reproduces the earlier probe runs exactly.
- Fade rises with the multiplier: 0.47%, 1.5%, 4.2% and 10.7%, a log-log slope of 0.91. The
  smallest step in the committed sets' band is f = 30, three times what 7r's cells needed.
- All 56 designs finish 100 cycles, at about 10 s each.

## What seven sets say

| pooling (held-out folds)                   | theta &minus; uniform, cycles/design | set bootstrap 95% | folds met, theta / uniform |
|--------------------------------------------|---------------------|-------------------|----------------|
| four committed sets (20)                   | &minus;4.50         | &minus;8.50 to +0.25 | 19 / 19 |
| plus `Marquis2019` (25)                    | &minus;5.45         | &minus;9.10 to &minus;1.13 | 21 / 23 |
| seven sets, probe-chosen rates (35)        | &minus;4.52         | &minus;7.55 to &minus;1.43 | 28 / 31 |
| seven sets, 7r's cells at f = 30 (35)      | &minus;2.32         | &minus;6.86 to +2.48 | 30 / 33 |

The pre-registered test (H357) asked whether the seven-set interval lies below zero, and it does.
The rule is cheaper on 21 folds and dearer on 6 (sign test p = 0.006).

The new cell itself is a worse picture. There the threshold rule meets its accuracy target on 2 of
5 held-out pools, and the uniform 50-cycle rule on 4 (H356 refuted). The rule saves 9.25 cycles per
design on average, but 20 of the 46 cycles it saves come from two pools where it stops early and
misses. The ten-cycle forecast is also the noisiest of any set at its chosen rate (75th-percentile
error 0.267, against 0.06 to 0.12 on the committed sets). It is the first tuned cell whose
lithium loss runs ahead of its ten-cycle slope rather than behind it (median drift multiplier
1.29).

## Reading it

All three cells tuned by the ladder now tell the same story. Averaged over chemistries, the
triage rule is cheaper than a fixed run length. On the tuned plating cells, part of that saving is
a miss, because the nested safety margin does not carry from one design pool to the next. And
whether the pooled interval clears zero depends on which passing plating rate those cells get.
So the paper keeps the four-set interval as its headline. It reports the tuned cells as a range
that now covers three chemistries at one end and still spans zero at the other.

All the lithium this cell loses early is plated, and it drifts a long way in one direction. By
milestone 7y's reading, that makes it the kind of cell where the corrected ten-cycle forecast
paid off, so that is the next pre-registered test. Code, fold rows and the plan are in
[`experiments/plating7z`](../../research/cell-fidelity/experiments/plating7z/results.txt) and the
programme's [log](../../research/cell-fidelity/LOG.md).

Produced with AI assistance (Claude). Everything here is modelled in PyBaMM 26.10.1.1 with a tuned
plating rate. None of it was measured on a real cell.
