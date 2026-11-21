---
title: "Four training pools cannot say when to correct a battery fade forecast"
date: 2026-11-21
tags: [battery-simulation, pybamm, cross-validation, research, cell-fidelity]
description: "An out-of-fold gate keeps a ten-cycle fade correction's 30-cycle saving on plating cells but still misses 3 of 20 folds on four standard parameter sets."
---

The [last cell-fidelity post](2026-11-21-a-battery-fade-correction-that-only-works-on-plating-cells.md)
ended with a split result. A corrected ten-cycle forecast of lithium loss saves 30 DFN cycles per
design on cells where lithium plating dominates the fade. On four standard PyBaMM parameter sets
(`Ai2020`, `Chen2020`, `OKane2022`, `NCA_Kim2011`) the same forecast made the triage rule miss its
accuracy target on 16 of 20 held-out folds instead of 19. A gate fitted on the training pools didn't
fix it, and part of the training errors it was chosen on were in-sample. So the obvious next question
was whether an honest gate would.

## What this run did

No new simulation: the same 200 designs on the four sets, plus the 100 designs on the two tuned
plating cells at each of two plating rates. The hypotheses (H344 to H348) were committed before the
numbers were computed ([log, milestone 7x](../../research/cell-fidelity/LOG.md)).

The rule was rebuilt so that every corrected error that a decision is scored on comes from a
correction fitted without that design's pool:

- **the gate**: use the correction in a fold only if, on the four training pools, its
  out-of-fold median error beats the straight-line forecast's;
- **the margin**: in each inner fold, the held-out inner pool is corrected on the other three
  pools, and the inner training rows on the remaining two;
- **the final pick**: made on out-of-fold errors, not in-sample ones.

As a control, forcing the correction to do nothing (m&#770; = 1) reproduces the uncorrected rule
on all 40 folds, and the replayed baselines match the earlier runs exactly.

## What it found

| rule (four committed sets, 20 folds) | folds meeting target | DFN cycles per design |
|---|---|---|
| uncorrected triage rule (theta) | 19 | 43.5 |
| corrected, in-sample margin (7w) | 16 | 44.9 |
| corrected, out-of-fold margin, no gate | 17 | 46.8 |
| corrected, out-of-fold margin and gate | 17 | 45.4 |
| uniform run length (U) | 19 | 48.0 |

The gate does what it can. It turns the correction off on all five `Ai2020` folds, where the
correction's chosen observable doesn't carry over, and that set comes back exactly (43.0 cycles,
5 of 5). On the plating cells it stays on, and the full saving survives: &minus;30 cycles per design
against a uniform run length on all 10 folds (sign p = 0.002).

But on the committed sets the gated rule is still worse than not correcting: 17 of 20 folds against
19, and +1.9 cycles per design. Removing the in-sample leak without a gate also gives 17 of 20, so
the leak was not what cost the earlier run its folds. A post-hoc gate on the 75th percentile, the
statistic the accuracy target actually uses, makes the same choices on these sets.

## Why

The misses that remain are `Chen2020` and `OKane2022` on the newest pool of designs, and
`NCA_Kim2011` on the first. On those sets the correction beats the straight forecast on every
training pool when it's fitted on the others, and then fails on the pool it hasn't seen. Four pools
of 8 to 16 designs can't tell that apart from a plating cell, where the same test also says "correct"
and is right.

So the decision of whether to correct can't come from the training errors alone. It needs a
mechanism signal, such as how much of the early lithium loss one reaction accounts for, or more
pools. The paper's recipe stays as it was: a straight ten-cycle forecast plus drift-score triage by
default (19 of 20 folds, 4.5 fewer DFN cycles per design than a uniform run length), and the correction only
where plating is known to dominate.

Caveats: PyBaMM simulations, not measured cells; four parameter sets and two tuned cells, five folds
each; one cell design per row. Results:
[`experiments/gate7x/results.txt`](../../research/cell-fidelity/experiments/gate7x/results.txt).
Project page: [cell-fidelity](https://marisstella.app/research/cell-fidelity/).
