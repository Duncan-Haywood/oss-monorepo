---
title: "Plating share can't say when to correct a battery fade forecast, and no other gate could either"
seo_title: "When to correct a ten-cycle battery fade forecast: no gate works"
date: 2026-11-22
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "Plating is 99% of early lithium loss where a battery fade-forecast correction fails and where it pays, so plating share cannot gate it. Nor can an oracle."
---

The [cell-fidelity programme](../../research/cell-fidelity/) speeds up battery electrode design
searches. It runs each candidate design for ten cycles of PyBaMM's full DFN model, forecasts the
lithium lost by cycle 99, and extends only the designs a drift score flags. A correction to that
ten-cycle forecast saves 30 DFN cycles per design on two cells whose plating reaction was sped up.
On the four parameter sets the programme's main result rests on, the correction
[costs accuracy](2026-11-21-a-battery-fade-correction-that-only-works-on-plating-cells.md), and
[a gate fitted on the training pools](2026-11-21-four-training-pools-cannot-say-when-to-correct-a-battery-forecast.md)
did not fix that. The open question was whether a physical signal could say when to correct.

## The two gates

Both gates were written down before they were scored
([log, milestone 7y](../../research/cell-fidelity/LOG.md)), and both read only the four training
pools of each held-out fold:

- **Plating share.** Correct a parameter set only if plating is at least 90% of the lithium lost
  over cycles 2 to 10. This number is visible inside the ten-cycle look.
- **Drift size.** Correct only if the training designs' median |m &minus; 1| is at least 0.10. Here m
  is how far a design's fade rate drifts from its ten-cycle slope by cycle 99.

## What came out

| rule, four committed sets (20 held-out folds) | folds meeting the accuracy target | DFN cycles per design |
|---|---|---|
| triage alone (straight forecast) | 19 | 43.5 |
| plating-share gate | 17 | 45.4 |
| drift-size gate | 17 | 46.8 |
| per-set oracle (post hoc) | 19 | 43.5 |

The plating share does not separate anything. It is 0.991 to 0.999 on every design of `Chen2020`,
`OKane2022` and `NCA_Kim2011`, the same as on the tuned plating cells. Only `Ai2020` is different, at
0.029. The plating gate therefore makes the same choice as the training-error gate and gets the same
17 of 20.

The drift-size gate did worse than I expected when I wrote the plan. I had read an earlier table's
|median m &minus; 1| as if it were the median of |m &minus; 1|. Per design, the committed sets drift as
far from their ten-cycle slope as the plating cells do (0.12 to 0.26, against 0.19 and 0.42), but in
both directions. So the gate is on almost everywhere. It cost 3.25 more DFN cycles per design than
triage alone: 8 folds dearer, none cheaper, sign test p = 0.008.

The last row settles the question. An oracle that looks at each set's held-out outcome and picks
corrected or straight for the whole set picks straight on all four committed sets. No gate, however
clever, could beat triage alone on these sets. The correction's saving exists only on the tuned
cells, and both gates keep all of it there: every fold stops at ten cycles, 30 below a uniform run
length.

## The counter-example

`NCA_Kim2011` is why no signal works. Plating is 99.4% of its early loss, and its drift runs one way:
|median m &minus; 1| is 0.23, more than the 0.19 of one plating cell where the correction pays. On
every signal tried it looks like a cell to correct. Yet the corrected rule misses its accuracy target
on one of five held-out pools (5zk). With five pools per set, that single miss is all that separates
it from the plating cells, and nothing in the training pools predicts it.

## What it means for the recipe

The [paper draft's recipe](../../research/cell-fidelity/paper/discussion.md) stays as it was. Run every
design ten DFN cycles, score drift risk from the cycle-2 plating depth, and extend the flagged designs
to cycle 50. That met 19 of 20 held-out folds at 43.5 cycles per design. The correction is a large
saving on plating-limited cells, but the programme cannot yet name in advance which cells those are.
Three steps (7w to 7y) have now tested gates. The next gain will come from breadth, a seventh parameter
set, rather than from another gate.

All numbers are PyBaMM 26.10.1.1 DFN simulations, not measured cells. Code and output:
[`experiments/gate7y/`](../../research/cell-fidelity/experiments/gate7y/results.txt). Produced with AI
assistance (Claude).
