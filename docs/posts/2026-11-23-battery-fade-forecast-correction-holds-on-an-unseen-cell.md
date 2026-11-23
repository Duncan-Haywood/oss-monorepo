---
title: "A battery fade-forecast correction holds on a cell it was never tuned on"
seo_title: "Battery fade-forecast correction holds on an unseen plating cell"
date: 2026-11-23
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "On a new PyBaMM plating cell, a pre-registered corrected ten-cycle fade forecast meets 4 of 5 held-out pools at a third of the uniform rule's DFN cycles."
---

The [cell-fidelity programme](../../research/cell-fidelity/) tries to make battery electrode design
searches cheaper. Each candidate design runs ten cycles of PyBaMM's full DFN model. A straight-line
law then forecasts how much cyclable lithium the design will have lost by cycle 99, and a threshold
rule decides which designs need to keep running. Earlier steps found a correction to that ten-cycle
forecast that saved about 30 DFN cycles per design on two cells where lithium plating dominates the
fade. On the four stock parameter sets it did not pay. The open question was whether the saving was
real or an artefact of the two cells it was found on.

## The test

The previous step (7z) added a seventh set-condition. PyBaMM's `Marquis2019` cell barely fades under
this protocol, so a pre-registered ladder copied `OKane2022`'s plating model into it and scaled the
rate until four probe designs lost 3 to 20% of their lithium in 20 cycles. That happened at 30 times
the copied rate. On this cell the straight-forecast rule met its accuracy target on only 2 of 5
held-out pools. The cell also behaves differently from the earlier plating cells: its lithium loss
speeds up after cycle 10 (median drift multiplier 1.29) where theirs slowed down.

Milestone 7za ran every corrected rule and every gate from milestones 7v to 7y on this cell. All of
them were written before the cell existed. The four hypotheses and their thresholds were committed
before the scoring script ran ([log](../../research/cell-fidelity/LOG.md)). No new simulation was
needed: the step reuses 7z's 56 DFN runs.

## What it found

| rule (5 held-out pools) | pools on target | DFN cycles per design |
|---|---|---|
| uniform run length | 4 of 5 | 44.0 |
| triage, straight forecast | 2 of 5 | 34.8 |
| triage, corrected forecast (honest margin) | 4 of 5 | 14.6 |

- The corrected rule costs 29.4 cycles per design less than the uniform rule and 20.2 less than
  straight triage, and it is cheaper on every pool.
- Coverage improves as well. Straight triage stopped too early on three pools; the corrected rule
  misses one.
- How the margin is chosen matters here. With the earlier in-sample margin (7v) the corrected rule
  meets only 2 of 5. With the out-of-fold margin from 7x it meets 4.
- All three gates (an out-of-fold error gate, a plating-share gate and a drift-size gate) turn the
  correction on in every fold. Plating is essentially all of the early lithium loss on this cell, and
  every design drifts the same way.
- All three plating cells now save about the same amount: &minus;29.8 cycles per design against the
  uniform rule, with a set-bootstrap interval of &minus;30.0 to &minus;29.4. This holds whichever way
  the drift runs.

## What it does not settle

Across all seven set-conditions, the plating-share recipe saves 12.0 cycles per design against
straight triage. It meets its target on 31 of 35 folds, against triage's 30. The set-bootstrap 95%
interval is &minus;25.0 to +0.1, so it still touches zero. That hypothesis is reported as
inconclusive, not supported. The upper end of the interval was +2.5 before this cell was added.
`NCA_Kim2011` is still unexplained: its drift is large and one-directional, and the correction still
misses one held-out pool there.

The new cell is also not a measured Kokam pouch. It is `Marquis2019`'s open-circuit potentials and
transport combined with `OKane2022`'s plating at 30 times its rate. The evidence is five folds on one
cell.

The paper's recipe is now: use triage by default, and use the corrected forecast on cells whose
early lithium loss is plating-limited. On those, three of three tuned cells save about two thirds of
the DFN budget with no loss of coverage against a uniform run length. Results:
[`experiments/marq7za/results.txt`](../../research/cell-fidelity/experiments/marq7za/results.txt).
