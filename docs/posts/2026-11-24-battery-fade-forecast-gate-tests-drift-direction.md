---
title: "Which way the drift runs: a direction test fixes three of four battery sets the fade-forecast gate got wrong"
seo_title: "Battery fade forecast gate: test which way the drift runs"
date: 2026-11-24
tags: [battery-simulation, pybamm, research, cell-fidelity]
description: "Adding a one-way-drift test to the cell-fidelity fade-forecast gate is right on 7 of 8 battery sets and saves 15.4 DFN cycles per design against triage."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how few cycles of a full
porous-electrode (DFN) battery simulation an electrode design search needs per design. Its recipe
runs every design ten cycles, sends the ones likely to drift on to fifty, and, on some cells,
corrects the ten-cycle fade forecast so every design can stop at ten.

[This morning's paper step](2026-11-24-battery-fade-forecast-gate-on-drift-not-plating.md) gated
that correction on drift size: switch it on when the training designs' median drift multiplier is
at least 10% away from 1. It also admitted a hole. The gate never asks which way the drift runs, and
the four published parameter sets drift both ways, so the gate is on for all of them and the
correction costs there (+3.25 cycles per design, 17 of 20 held-out folds met against triage's 19).

## The test

Milestone 7ze adds the missing check. In each held-out fold, from the training designs only, count
how many drift multipliers sit above 1 and how many below; the direction share is the larger count
over the total. The new gate is on when the size gate is on *and* the share is at least 0.80. The
threshold, the hypotheses and the control were committed to the research log before any share was
computed. No new simulation: the gate only picks, fold by fold, between the corrected and straight
outcomes already stored.

The control passed exactly: the size gate recomputed from the rebuilt multipliers matched all 55
stored decisions, and recomposing the stored outcomes under it gives back the stored rule.

## What it found

| set | direction share per fold | size gate | direction gate | best choice (post hoc) |
|---|---|---|---|---|
| Chen2020 | 0.61 to 0.70 | on | off | off |
| OKane2022 | 0.50 to 0.59 | on | off | off |
| Ai2020 | 0.62 to 0.75 | on (4 of 5) | off | off |
| NCA_Kim2011 | 0.93 to 0.97 | on | **on** | off |
| Mohtat2020, f = 30 | 0.85 to 0.93 | on | on | on |
| Ecker2015, f = 30 | 0.95 to 0.98 | on | on | on |
| Marquis2019 with plating | 0.94 to 0.98 | on | on | on |
| Marquis2019, SEI only | 1.00 | on | on | on |

Seven of eight right. Over the eight set-conditions (40 folds), against drift-score triage alone:

| rule | saving, DFN cycles per design | set bootstrap 95% | folds met |
|---|---|---|---|
| size gate | 14.7 | 1.8 to 27.7 | 36 of 40 |
| out-of-fold error gate | 15.4 | 3.1 to 28.0 | 36 of 40 |
| **direction gate** | **15.4** | **3.2 to 28.0** | **37 of 40** |

It is the cheapest deployable gate, by a hair, and the only one to meet 37 folds. On the published
sets alone it halves the cost of correcting (+1.75 against +3.25) and meets 18 of 20. Without the
engineered SEI cell, the seven-condition interval runs from 25.1 cycles saved to exactly zero: the
closest any gated rule has come, and not past the line.

## What it did not fix

`NCA_Kim2011` drifts large and one way, so the direction gate corrects it, and the corrected
forecast still misses one held-out pool there. So one-way drift is necessary for the correction to
pay, not sufficient. All of the remaining cost on the published sets is that one set.

Two honesty notes. The gate's form was chosen after seeing that direction is what the size gate
missed, so these eight conditions are not an out-of-sample test of it (only the threshold was fixed
blind). The nearest thing to one is the slower plating rate, f = 10: there the direction gate
fixes `Ecker2015`, which the size gate got wrong, but `Mohtat2020` drifts too little for either gate,
though correcting would have paid.

Next: find out why `NCA_Kim2011`'s corrected forecast misses its pool, from the residuals on that
fold. The run, results and tests are in
[`experiments/dirgate7ze/`](../../research/cell-fidelity/experiments/dirgate7ze/), and the log entry
with every hypothesis verdict is in the programme's [research log](../../research/cell-fidelity/LOG.md).

*Written with AI assistance. Results are simulations with PyBaMM's published parameter sets, not
measurements on cells.*
