---
title: "Battery design triage on 32 cell designs never simulated: 9 of 12 on target, 17 to 19% fewer DFN cycles"
seo_title: "Battery design triage on new cell designs: 17-19% fewer DFN cycles"
date: 2026-11-19
tags: [research, batteries, pybamm, design-search, replication]
description: "Frozen drift-score triage rules, scored on 32 fresh PyBaMM DFN designs, still meet the tail target 9 times in 12 and save 17 to 19% of DFN cycles."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how cheaply
a lithium-ion electrode design search can use the full porous-electrode model
(DFN) and still forecast capacity fade. The last step
([triage with an out-of-batch margin](2026-11-19-battery-triage-with-an-out-of-batch-margin.md))
found a rule that met its accuracy target on 9 or 10 of 12 held-out batches
of designs while saving 20% of the DFN cycles. But every one of those batches
had been used, in some role, by earlier steps. This step simulated a batch
nobody had seen and scored the rules on it unchanged.

## What was run

32 new designs, 8 in each of four PyBaMM parameter sets, drawn from the same
design pools with every earlier pick excluded, were run in the DFN to cycle
100 with the same bench as before (about six minutes on three cores, all 32
first time). The drift score for each new design came from a correction
fitted on the 104 earlier designs only, so no new design informed any new
design's score.

The rules were not refitted. Each of the 12 policies the last step chose
(four parameter sets, three held-out pools each) was applied as it stood to
the new batch of its set. The target is unchanged: the upper quartile of the
cycle-99 lithium-loss forecast error at most 1.25 times what running every
new design to cycle 50 gives. The four hypotheses were committed before the
bench ran ([log, milestone 7g](../../research/cell-fidelity/LOG.md)).

## What came out

| rule (frozen from the last step) | policies on target | DFN cycles per design | saved |
|---|---|---|---|
| threshold on the drift score | 9 of 12 | 41.7 | 17% |
| flag fraction | 9 of 12 | 40.5 | 19% |
| fraction plus delta | 5 of 12 | 34.0 | 32% |
| uniform run length | 12 of 12 | 50.0 | 0% |
| every design to cycle 50 | all | 50.0 | 0% |

Refitting each rule on all three earlier pools instead gave the threshold rule
3 of 4 sets at 41.2 cycles and the uniform rule 4 of 4 at 47.5 (5% saved).

1. **The result replicates.** 9 of 12 on target, as on the reused batches,
   and the saving drops only from 20% to 17 to 19%. A pre-registered test of
   "at most 40 cycles" came out inconclusive at 41.7, just over the line.
2. **The misses are near-misses with a pattern.** The worst is 1.15 times the
   target. Two of them, on the `Ai2020` set, come from policies that run the
   flagged designs only to cycle 40, which is too short there.
3. **An absolute threshold depends on the score's scale holding.** On two sets
   the drift score ran higher on the new designs (median 0.121 against 0.074
   on `Ai2020`), so a fixed threshold flagged every new design and saved
   nothing for those policies. A flag fraction cannot drift that way.

In hindsight, the cheapest threshold policy on each new batch would have cost
25 to 35 cycles per design, so the forward rules keep about half of what was
there to keep. Uniform run lengths cannot save anything worth having out of
batch, on either the reused or the fresh designs, which remains the case for
triage.

## Limits

Each new batch has 8 designs, so an upper quartile is one design, and the
three policies per set share one batch: the 12 are really 4 tests. The fade
is modelled, not measured; there is one fade-law form and one PyBaMM version.
The next steps are the paper's results section, a rule that always extends to
cycle 50 and tunes only who is flagged, and a threshold set as a quantile of
the training scores so it does not drift with their scale.

Code, results and figure:
[`experiments/fresh7g/`](../../research/cell-fidelity/experiments/fresh7g/).
Produced with AI assistance (Claude).
