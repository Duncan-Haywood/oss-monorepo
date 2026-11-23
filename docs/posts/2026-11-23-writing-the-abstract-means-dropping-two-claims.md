---
title: "Writing the battery paper's abstract meant dropping two claims"
seo_title: "Battery fade-forecast paper abstract: two claims dropped"
date: 2026-11-23
tags: [battery-simulation, pybamm, research, cell-fidelity, research-integrity]
description: "Over seven set-conditions the corrected battery fade forecast clearly beats a uniform run length, but not triage alone. Two claims stay out of the abstract."
---

The [cell-fidelity programme](../../research/cell-fidelity/) asks how few cycles of PyBaMM's full DFN
battery model an electrode design search can pay per design and still rank designs by their lithium
loss at cycle 100. After about forty milestones it had results spread over three tables and a long log.
It had no abstract. This step wrote one, and to keep it honest it first added the newest cell to the
table everything else is quoted from.

## One more column

Milestone 7za tested a correction to the ten-cycle fade forecast on `Marquis2019`, a plating cell built
after every rule and gate had been fixed. The paper's Table 3 is now regenerated with that cell as a
seventh set-condition (35 held-out folds). The control is exact: the script reproduces 7za's stored
intervals to 1e-9. Three numbers are new:

- **Against running every design for a uniform number of cycles,** every corrected rule is now clearly
  cheaper across all seven conditions: 13.5 to 14.4 DFN cycles per design saved, with set-bootstrap upper
  ends of &minus;3.8 to &minus;4.7. They meet the accuracy target on 28 to 31 of 35 folds, against the
  uniform rule's 33.
- **Against triage alone,** without the correction, no rule with an honest margin is clearly cheaper. The
  best saves 12.0 cycles per design, but its interval runs from &minus;25.0 to +0.1.
- One corrected interval against triage does lie below zero. It belongs to the ungated rule whose margin
  leaks information from the held-out pool, and it meets two fewer folds. A table that only reported
  intervals would make that look like the winner. Reported with its coverage, it is a cheaper rule that
  misses more often, so the paper does not recommend it.

## What the abstract leaves out

[The abstract](../../research/cell-fidelity/paper/abstract.md) traces each number to a table or log entry.
Two claims that earlier drafts of the README leaned on are not in it:

1. **That drift-score triage beats a uniform run length across chemistries.** It is cheaper fold by fold.
   But the 95% interval over chemistries runs from &minus;7.55 to &minus;1.43 cycles per design when the
   three tuned cells sit at their probe-chosen plating rates, and from &minus;6.86 to +2.48 when all three
   run at the faster rate. An interval that depends on that choice is a range, not a claim.
2. **That some signal says in advance when to correct the forecast.** Three gates were tried, and on the
   four published parameter sets none does better than leaving the forecast uncorrected. A hindsight
   oracle that picks per set does no better either: it chooses the uncorrected forecast on all four.

What remains is plainer. Run ten cycles, score each design's drift risk and extend only the flagged
designs. That met 19 of 20 held-out folds at 43.5 DFN cycles per design, and as a tool it saved 17% of
wall time. Use the corrected forecast only on cells known to be plating-limited, where all three tuned
cells saved about 30 cycles per design against a uniform run.

All of this is model-to-model: PyBaMM simulations, not measured cells. The next step is a cell that drifts
hard in one direction without plating. It would test whether drift alone, rather than plating, is what
makes the correction pay.

Tables: [`paper/tables.txt`](../../research/cell-fidelity/paper/tables.txt). Log:
[`LOG.md`](../../research/cell-fidelity/LOG.md).
