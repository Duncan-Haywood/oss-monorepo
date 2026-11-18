# Pre-registration: an uncertain lead, a range of backdates read together (2026-11-18)

Written after two exploratory runs (seed bases 81000 and 82000, 50 and 60 panels a cell,
`eval/synth-lead-range-explore.out.txt`) and before the confirmatory one (fresh base **83000**, 400 panels a cell).
Committed on its own before that run.

**Why.** README "A shock before the date" shipped `--anticipation N` for a lead that is known exactly and ended
"Next: ... a lead that is uncertain (a range of backdates reported together without picking the best p)". People
often know only that a reaction could have started up to a few points early (a bill debated for months, an
announcement whose reach is unclear). Running `--anticipation` at 0, 1, 2, 3 and 4 and keeping the smallest p is not a
test: in exploration it raised the no-effect p <= 0.05 share from 1.7-2.0% to 4.0-5.0% (A0) and from 3.3-8.0% to
8.3-10.0% (A4).

**Method** (`eval/synth-lead-range-sim.mjs`, `synthLeadRange` in `synth-control.mjs`, fixed by this file). Panels from
`eval/synth-anticip-sim.mjs`, cell N1 (39 units, 19 points before the stated date, 12 after). Cells: A0 nothing; A4 a
covariate shock (every unit moves by 1.0 x Z) from 4 points before the stated date, no effect; E0, E2, E4 the treated
unit drops by 1 from 0, 2, 4 points before the stated date. Each panel is fitted at every backdate 0..4 (outcome-only
fit, floored ratio, shipped defaults). Range statistics, each a placebo test that ranks the treated unit's value among
all 39 units' values computed the same way:

- **max-scaled (primary):** each unit's largest floored statistic over the five leads, each lead's statistic divided
  by that lead's median over all units;
- **mean (secondary, reported):** each unit's floored statistic averaged over the five leads;
- **min-p (reported):** the permutation min-p adjustment (Westfall and Young 1993) of the per-lead placebo p's.
  Exploration showed it is coarse with 39 units (at p <= 0.05 only rank 1 counts, and some placebo is nearly always
  rank 1 at one of the leads): E0 32-36% against 54-65% at the stated date. It is not a candidate.

Also reported: the stated date (lead 0), the oracle (backdated by the true lead), the naive smallest p over the
leads, Bonferroni (5 x the naive) and the largest p over the leads.

Exploratory max-scaled (run 2, 60 a cell): A0 0.0%, A4 1.7%; E0 51.7% (stated 65.0%); E2 55.0% (stated 38.3%, oracle
53.3%); E4 48.3% (stated 25.0%, oracle 53.3%). Mean: A0 0.0%, A4 1.7%, E0 55.0%, E2 48.3%, E4 45.0%.

## Bars (confirmatory, 400 a cell, max-scaled)

1. **Size.** In A0 and A4 the p <= 0.05 share is at most 10%.
2. **It recovers an anticipated effect.** In E2 and E4 its power is at least 10 points above the stated date's.
3. **Its cost when nothing was anticipated.** In E0 its power is at most 15 points below the stated date's (backdating
   by 2 and by 4 cost 9.8 and 18.5 points in `eval/synth-anticip-confirm.out.txt`).
4. **Near a known lead.** In E2 and E4 its power is within 10 points of the oracle's.
5. Reported: the naive smallest p's size in A0 and A4 (against the stated date's), the mean statistic's and min-p's
   rows, and which lead had the smallest p.

**Decision.** If 1, 2 and 3 hold, the CLI accepts a range, `--anticipation 0-4` (any `a-b` with 0 <= a < b), and
prints every lead's gap and p together with the max-scaled range p as the one p to read, and the page's "Points
people saw it coming" box accepts the same range; the text cites this run and says the naive smallest p is not a
test. If 4 fails, the text says the range trails a known lead by the measured points. If 1, 2 or 3 fails, nothing
ships on the CLI or the page; `synthLeadRange` stays in the module with the result written up. Real states are not
refitted as part of the bars (Proposition 99 may be shown as an illustration afterwards).
