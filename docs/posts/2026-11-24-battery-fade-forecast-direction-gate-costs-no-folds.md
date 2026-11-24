---
title: "Does testing which way battery drift runs cost the fade-forecast gate accuracy? It buys a fold back"
seo_title: "Battery fade forecast: a direction gate that costs no accuracy"
date: 2026-11-24
tags: [battery-simulation, pybamm, research, cell-fidelity]
description: "In the cell-fidelity paper's Table 3, the direction-aware gate meets 28 of 30 held-out folds, as many as triage alone, while saving 10.7 DFN cycles per design."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how few cycles of a full
porous-electrode (DFN) battery simulation an electrode design search needs per design. Its recipe
runs every design ten cycles, sends the ones likely to drift on to fifty, and on some cells corrects
the ten-cycle fade forecast so every design can stop at ten.

[Earlier today](2026-11-24-battery-fade-forecast-gate-tests-drift-direction.md), milestone 7ze added
a direction test to the gate that decides when to correct: correct only when the training designs'
drift is large *and* at least 80% of it runs the same way. It reported the gate on the pooled
conditions its hypotheses named. This step puts it in the paper's Table 3 next to every other rule,
which shows two things 7ze did not log.

## What changed in the table

`paper/tables.py` now reads 7ze's stored fold rows and adds the direction gate (θS) as a row of
every Table 3 block. Its pooled numbers recur exactly: 7ze's eight-, seven- and four-set means,
intervals and fold counts come out the same to the last digit, and every earlier line of the table
is unchanged. No new simulation, no new hypothesis.

Over the six set-conditions (the four published PyBaMM parameter sets plus two cells tuned to
plate at rate factor f = 30, 30 held-out folds), against drift-score triage alone:

| rule | folds met | DFN cycles per design | saving vs triage | set bootstrap 95% |
|---|---|---|---|---|
| triage alone (θ) | 28 of 30 | 44.2 | reference | |
| corrected, no gate | 26 of 30 | | 10.9 | −1.8 to 24.3 |
| size gate (θD) | 27 of 30 | | 9.7 | −4.1 to 24.0 |
| out-of-fold error gate (θN) | 27 of 30 | | 10.6 | −2.5 to 24.3 |
| **direction gate (θS)** | **28 of 30** | **33.5** | **10.7** | **−2.3 to 24.3** |
| hindsight oracle | 29 of 30 | | 11.8 | 0.0 to 24.3 |

The direction gate is the first corrected rule that gives up no held-out folds to triage on these
six conditions, and it keeps the size-only gates' saving. With six clusters, no interval here clears
zero; this is a fold count, not a significance result.

## The trade at f = 10

At the slower plating rate (f = 10, reported but not pooled), the training drift runs both ways, so
the direction gate is off on all ten folds and the rule is plain triage: 7 of 10 folds met at 32.8
cycles per design. The size-only gates correct there, at 19.8 to 23.8 cycles, and meet 6 of 10. So
the direction test gives up 9 to 17 cycles of saving for one more fold met. It is the conservative
gate: it corrects less often, and when it does correct, the drift points one way.

Against the hindsight oracle, which picks the better of corrected and straight for each set after
seeing the held-out outcome, the direction gate recovers 90%, 92% and 95% of the oracle's saving on
six, seven and eight conditions. It decides differently from the size gate on 19 of 55 folds, every
one a fold where the size gate was on and the training drift ran both ways.

## What it still does not fix

`NCA_Kim2011` drifts large and one way, the direction gate corrects it, and the corrected forecast
misses one held-out pool there. That set is all of the remaining cost on the published sets (+1.75
cycles per design, 18 of 20 folds against triage's 19). The gate's form was chosen after seeing what
the size gate missed, so these conditions are in-sample for it. The paper's abstract now gives the
recipe's gate as drift size and direction, with both caveats.

The regenerated table is [`paper/tables.txt`](../../research/cell-fidelity/paper/tables.txt), the
text is section 4.7, finding 11, of [`paper/results.md`](../../research/cell-fidelity/paper/results.md),
and the log entry is in the programme's [research log](../../research/cell-fidelity/LOG.md).

*Written with AI assistance. Results are simulations with PyBaMM's published parameter sets, not
measurements on cells.*
