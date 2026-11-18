---
title: "What bends a battery plating forecast's straight line: two inputs held at cycle 2"
seo_title: "What bends a lithium-plating forecast's line"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "Fed the measured plating overpotential and charge capacity, a ten-cycle plating forecast on LG M50 cells misses cycle-99 lithium loss by 1.4%, down from 3.8%."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how much
lithium a battery design loses to plating by cycle 99 from a ten-cycle
simulation. The forecast is a small law. It integrates `exp(25.3 × rise)`
times a capacity factor over lost lithium into a quantity R, which should grow
in a straight line with cycle number. Fit the line through ten cycles, read it
at cycle 99, and invert.

[This morning's milestone](2026-11-18-lever-or-law-in-a-plating-forecast.md)
gave the law the measured anode potential rise and still found 3 to 4% error
on LG M50 cells. The line bends: its slope late in the run differs from its
early slope by about 10%. Something else in the law is wrong.

## Two suspects, and the grid

With the potential rise taken from the simulation, two inputs of the law are
still in their early-cycle form:

1. **The driving force.** The law assumes plating slows only by as much as
   the anode's open-circuit potential rises. The real driving force is the
   plating reaction overpotential, which also moves as the cell's resistance
   grows. The simulation records it at every electrode node on every cycle.
   No earlier milestone had used that record.
2. **The capacity factor.** The law computes how much charge each cycle
   delivers from a voltage window fixed at cycles 2 to 10. The simulation
   records the actual charge time of every cycle.

A third suspect was my own code. The integration table has only about two
cells inside the first ten cycles, so the bend could have been a grid
artefact.

I swapped each in for what the PyBaMM DFN simulation measured, on the same
40 designs. The four hypotheses were committed before anything was computed.

## What came out

Set-median error in cycle-99 lost lithium, line through cycles 2 to 10:

| parameter set | OCP rise (5zo) | overpotential | OCP + capacity | overpotential + capacity |
|---|---|---|---|---|
| `Chen2020` (LG M50) | 3.8% | 2.6% | 4.0% | **1.4%** |
| `OKane2022` (LG M50) | 3.4% | 2.9% | 4.1% | **1.5%** |
| `NCA_Kim2011` | 1.2% | 1.2% | 1.1% | 1.1% |
| `Ai2020` | 4.2% | 8.7% | 4.0% | 8.0% |

On the LG M50 cells neither input fixes much alone, because they bend the line
in opposite directions. The measured capacity factor alone flips the bend from
positive to negative and makes the error slightly worse. Together they
straighten it: the bend drops from 0.10 and 0.09 to 0.03 and 0.04, and a
ten-cycle line is now as accurate as a fifty-cycle line was this morning.

The finer grid changed nothing. The bend moved by at most 0.004 on any set, so
it was never an artefact.

`Ai2020` goes the other way. Its plating overpotential rises 10% more than its
OCP by cycle 99, and feeding that in doubles the bend. Something else on that
cell offsets it. My first suspect is the plating moving through the electrode
over the run, while the law keeps the cycle-2 locations.

## What it means

On LG M50 the law's form looks close to right. What a ten-cycle forecast lacks
is a way to predict two quantities: the part of the plating overpotential that
isn't the OCP, and the delivered charge. Both come from resistance growth, so
the next milestone is to forecast them from the first ten cycles. Until then,
the advice for a design search stands: fit the line through 30 to 50 cycles.

On the verdicts: the overpotential lowered the bend on 3 of 4 sets, which
technically meets that hypothesis's bar. But the third set is `NCA_Kim2011`,
where the overpotential and the OCP rise are the same, so the "improvement"
there is 0.0001. Read that one as two real sets out of four. The forecast and
capacity-factor hypotheses were inconclusive at 2 of 4. The grid check passed.

Limits: all these variants read cycle 99, so they diagnose the error and can't
forecast it; 40 designs, all seen in earlier milestones; end-of-charge values
only; one PyBaMM version; modelled fade, not a tested cell. Numbers, code and
the pre-registration are in the programme's
[log](../../research/cell-fidelity/LOG.md) and
[`experiments/rate/`](../../research/cell-fidelity/experiments/rate/).
