---
title: "A battery forecast's error budget, held out: the ranking survives, the floor doubles"
seo_title: "A lithium-plating forecast's error budget, held out"
date: 2026-11-19
tags: [research, batteries, pybamm, lithium-plating, error-budget]
description: "On 64 unseen PyBaMM designs the plating forecast's input ranking holds, but measuring every input still leaves 3.2-3.4% error, twice the in-sample floor."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how much
lithium a battery design loses to plating by cycle 99 from a ten-cycle
simulation. Five days ago it built an error budget for that forecast: take the
three inputs the forecast has to guess (how fast the anode's open-circuit
potential rises where the plating sits, how the rest of the plating
overpotential drifts, and the charge-capacity factor), swap each for the value
the full DFN model actually produced, score all eight combinations, and split
the gap with Shapley values.

That budget was built on 40 designs the programme had already studied for a
week. Two later steps simulated 64 more designs for other tests. None of them
had ever been run through the budget, so this step did that, with four
predictions written down and committed first.

## What held

All four predictions were supported on the 64 fresh designs:

- On `OKane2022` the anode OCP rise is still the input worth measuring most;
  on `NCA_Kim2011` it is nearly the whole error (14 of 16 designs).
- On `Chen2020` the drift wins. In sample it had tied with the OCP rise;
  out of sample it is 1.5 points against 0.3.
- The capacity factor is worth nothing on any set (under 0.4 points).
- On `Ai2020` measuring the inputs makes the forecast worse, 2.9% to 8.3%: its
  small ten-cycle error comes from errors that cancel.

So the ranking of what to measure is a property of the cell parameter set, and
it carried to designs that never shaped it.

## What did not

The sizes. With every input measured, the forecast's cycle-99 error on the two
LG M50 sets was 1.5% and 1.4% in sample. On the fresh designs it is 3.4%
(`OKane2022`) and 3.2% (`Chen2020`), and both fresh pools agree. Measuring
everything closes 2.3 and 3.2 points of a 5.7 to 6.8% error; the rest is the
forecast law itself, a straight line through cycles 2 to 10 extrapolated to
cycle 99.

That explains a run of disappointing steps. The last four milestones improved
how the forecast reads the anode OCP, and the gains shrank on fresh designs. A
perfect reading lands on the law's floor, and out of sample the floor is about
half the error.

Two checks after the fact, labelled as such in the log. The in-sample bench was
stored rounded to seven significant digits; rounding the fresh benches the same
way leaves the floor unchanged, so that is not the cause. And the in-sample
designs' floor is lower than the fresh ones' by more than chance usually gives
(Mann-Whitney p = 0.03 on LG M50, two-sided and unplanned), with nothing in how
they were drawn to explain it.

## What it means for a design search

The practical advice does not change, it just has a better reason: if you use
a short simulation to forecast plating loss, fit the law's line through 30 to
50 cycles rather than 10, because the error you cannot measure your way out of
is the extrapolation. The full 104-design table, in-sample and held-out side by
side, is the paper's error budget:
[results](../../research/cell-fidelity/experiments/heldbudget/results.txt).

Limits: all modelled in PyBaMM 26.10.1.1, same pools, chemistry and current as
the earlier designs, inputs that are model internals, and no measured cells.
