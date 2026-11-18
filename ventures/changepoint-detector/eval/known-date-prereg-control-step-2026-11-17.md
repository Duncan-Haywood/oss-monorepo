# Pre-registration: the step alone, with a control series (2026-11-17)

Written after an exploratory simulation (seed base 91000, `eval/known-date-control-step-explore.out.txt`) and before
the confirmatory simulation (fresh seed base **97000**) and before any test is run on the real pairs below (the
tobacco data were downloaded and reshaped, and the placebo states chosen from the tax column alone; no sales series
has been put through the test or plotted). Committed on its own before either run.

**Why.** The control round (README "A control series", `eval/known-date-prereg-control-2026-11-17.md`) met every
simulation bar and failed one real bar: the joint test (step and slope change together) on drivers minus rear-seat
passengers fired at 3 of 3 placebo dates, reading a slow bend in the ratio through its slope term. The step's own p
fired at 0 of 5 placebo dates. The round's Next asked for "a step-only test with the control" and "real pairs beyond
road deaths, such as a policy that covered some regions and not others".

**Change (one decision rule, no new statistic).** With a control, the decision reads the step's p (`pStep`: |t| of the
step at the date in the model that still fits a slope change, bootstrapped as shipped in round 5) instead of the joint
p, and runs the in-time placebos (README "In-time placebos", unchanged) on the same difference. A **finding** is: the
pair is tested (not refused, not admitted only by the random-walk cut), `pStep <= 0.05`, and the placebos do not warn.
The slope change stays in the model as a nuisance term and is reported, but is not tested with a control.

**What the exploratory run showed** (200 pairs a cell): step size 3.5-5.0% in six no-change cells; power above the
joint test in every power cell (P1 68.5 vs 53.0%, P3 30.7 vs 14.1%); but a treated-only bend with the date at 80% of
the series makes the step fire 30-40% of the time (a straight line on the long before-period meets the short
after-line off the date). Those are the cases the placebos see: 60 of 60 and 79 of 81 such step rejections were
warned. So the rule pairs the step with the placebos, and the bend bars score the pair.

**Simulation** (`eval/known-date-control-step-sim.mjs`, cells as in the script: S1-S6 no change, B1-B6 a treated-only
bend or slope change and no step, P1-P5 a treated-only step). Confirmatory:
`KD_PLACEBO=1 KD_JSON=1 KD_SEED_BASE=97000 KD_SHARD=i/4 node eval/known-date-control-step-sim.mjs 400 199` for i 0-3,
merged with `eval/known-date-control-step-merge.mjs` into `eval/known-date-control-step-confirm.out.txt`.

## Bars

1. **Size.** The step's p at 0.05 rejects at least 2% and at most 8% of tested pairs in each of S1-S6.
2. **Bends.** Findings (step p <= 0.05 and no warning) are at most 8% of tested pairs in each of B1-B6.
3. **Power.** Findings as a share of all pairs: P1 at least 55%, P2 at least 50%, P3 at least 20%, P5 at least 30%;
   in each of P1, P2, P3 and P5 the step's p rejects a larger share of all pairs than the joint p. (P4, a step on a
   strong bend, is reported without a bar: the placebos are meant to warn there.)
4. **False warnings.** The placebos warn on at most 8% of tested pairs in each of S1-S6.
5. **Real pairs** (`node eval/known-date-control-step-real.mjs`, `eval/known-date-control-step-real.out.txt`): each
   state's cigarette packs per head (fiscal years, logs) against the mean of the 38 donor states of Abadie, Diamond and
   Hainmueller (2010), the treated state left out; window 1970 to the date plus 11 years; date = the first fiscal year
   that includes the tax rise. None seen before this file.
   - **T1** California, Proposition 99 (+25 cents a pack from 1 January 1989), date 1989, 1970-2000: a finding with
     step < 0.
   - **T2-T4** Massachusetts, Question 1 (+25 cents, 1 January 1993), date 1993; Arizona, Proposition 200 (+40 cents,
     1 December 1994), date 1995; Oregon, Measure 44 (+30 cents, 1 February 1997), date 1997: at least 2 of 3 are
     findings with step < 0.
   - **Q** placebo states: the nine donor states whose state tax per pack changed by at most 2 cents between FY1985 and
     FY1995 (AL, GA, KY, MS, MT, SC, TN, VA, WV; chosen from `data/us-cigarette-state-tax.csv` only), each at 1989,
     1970-2000, against the other 37 donors: at most 1 of 9 is a finding (either sign).

If 1-5 all hold, `--control <column>` ships in the CLI with `--known-date` (and `analyze({ knownDate: { date, control }
})`), reporting the step as the test, the slope change as unchecked, and the placebos on the difference. If any bar
fails, nothing ships and the README says which. Reported without a bar: the joint p in every cell and real pair, P4,
refusals, and the seat-belt pairs of the last round under the new rule (seen, so not a test).
