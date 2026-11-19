---
title: "Battery design triage with an out-of-batch margin: 20% fewer DFN cycles, 9 or 10 of 12 new batches on target"
seo_title: "Battery design triage with a margin: 20% fewer DFN cycles"
date: 2026-11-19
tags: [research, batteries, pybamm, design-search, cross-validation]
description: "A margin set by nested leave-one-pool-out lets drift-score triage hit its tail target on 9 or 10 of 12 new design batches with 20% fewer DFN cycles."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how cheaply a
lithium-ion electrode design search can use the full porous-electrode model
(DFN) and still forecast capacity fade. The last step
([triage savings that did not survive a new batch](2026-11-19-battery-triage-savings-did-not-survive-a-new-batch.md))
found that running only the designs a ten-cycle drift score flags on to cycle
50 beats every uniform run length in hindsight, but that the policy picked on
two batches of designs met the accuracy target on the third batch only 4 times
in 12. This step asked whether a safety margin, itself chosen out of batch,
fixes that, and what it costs.

## What was run

No new simulation: the same 104 PyBaMM DFN designs in four parameter sets,
each set split into three design pools. The target is the one that failed
before: the upper quartile of the cycle-99 lithium-loss forecast error on a
held-out pool, at most 1.25 times what running every design to cycle 50 gives
on that pool.

Four rules were compared, each with a margin knob:

- **Uniform:** every design runs k cycles; the margin tightens the training
  target.
- **Flag fraction:** the top share f of designs by drift score runs on to K1
  cycles; same margin.
- **Fraction plus delta:** the fraction picked with no margin, then widened by
  a delta.
- **Threshold (the pre-registered primary):** every design whose drift score
  is above an absolute threshold runs on; same margin as uniform.

The margin was picked by nested leave-one-pool-out. With pools A and B for
training, the rule was picked on A and scored on B, and the reverse; the
margin was the loosest one that passed both, and the rule was then refitted on
A and B together and applied to the held-out pool. The four hypotheses were
written down before anything was applied to a held-out pool
([log, milestone 7f](../../research/cell-fidelity/LOG.md)).

## What came out

| rule | held-out pools on target | DFN cycles per design |
|---|---|---|
| threshold, no margin | 3 of 12 | 26.5 |
| flag fraction, no margin | 4 of 12 | 27.3 |
| uniform, no margin | 7 of 12 | 41.7 |
| threshold, nested margin | 9 of 12 | 40.0 |
| flag fraction, nested margin | 10 of 12 | 40.0 |
| fraction plus delta, nested | 6 of 12 | 34.2 |
| uniform, nested margin | 12 of 12 | 50.0 |
| every design to cycle 50 | 12 of 12 | 50.0 |

Three things stand out.

1. **The margin works for triage.** Both triage rules go from 3 or 4 batches
   on target to 9 or 10, and keep 20% of the DFN budget.
2. **Uniform cannot save anything out of batch.** Given the same margin
   procedure, the uniform rule picks 50 cycles in every fold. No shorter run
   length holds across batches of designs. That is the real case for triage.
3. **Widening the fraction alone is the wrong knob.** If the extension length
   was picked too short, flagging more designs does not help: fraction plus
   delta met only 6.

The in-sample savings from the last two steps (33% to 61%) shrink to 20% out
of batch. That 20% is the number the paper should carry. Threshold against
fraction is not settled, since they are one fold apart. The threshold rule
does have one practical advantage: it needs no batch to rank against, so it
can decide one design at a time inside a sequential search.

## Limits

Each pool has 8 to 12 designs, so a held-out upper quartile comes down to one
or two designs. The drift score's correction was fitted on all pools, which
flatters both triage rules. The margin grids are coarse, and on five folds no
threshold margin passed both inner checks. There is one fade-law form and one
PyBaMM version, and the fade is modelled, not measured. The next step runs a
fresh fourth pool of designs to cycle 99, so the rules can be scored with no
reuse at all.

Code, results and figure:
[`experiments/margin7f/`](../../research/cell-fidelity/experiments/margin7f/).
Produced with AI assistance (Claude).
