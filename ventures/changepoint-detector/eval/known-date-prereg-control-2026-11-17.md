# Pre-registration: a control series for the known-date test (2026-11-17)

Written after an exploratory run (seed base 61000, below) and before the confirmatory run (fresh seed base **67000**)
and before the real placebo pairs (R3, R4) are run. Committed on its own before either starts.

**Why.** Round 6 (README "Round 6") ended: a test for series the random-walk cut lets through "needs evidence the guard
does not use: a control series (the rear-seat passengers did this job for the seat-belt law)". Round 5's real run also
showed the case for one: the slope after February 1983 rises by about 0.007 a month in drivers, front and rear-seat
passengers alike, so the joint test on drivers is partly reading a shared trend the law did not cause.

**Change (one).** `knownDateTest(x, k, { control, controlMode: 'difference' })` tests `x - control` (on logs, the log
ratio) with round 5's shipped test unchanged (matched rho, gated upper bound at 0.5, cut guard). Whatever moves both
series at or around the date (a shared trend change, a common wander, a common step) cancels. CLI `--control <column>`
with `--known-date`, `analyze({ knownDate: { date, control } })` and a field on the page.

A second arm, `controlMode: 'regress'` (the control as a fixed regressor with a free coefficient) was explored and is
**not** carried forward: on 100 pairs of cell S1 it rejected 18.0% with no treated-only change, because the control's own
noise attenuates the coefficient (errors in variables) and the part of the shared confounder it leaves is read as a
change. It stays in `known-date.mjs` as an option for reproducing that number.

**Simulation** (`eval/known-date-control-sim.mjs`). Each pair shares a common component C (AR(1) or a random walk,
innovation sd 1) and, in some cells, a confounder that moves both series at the date; control = C + e_c, treated =
0.05 t + C + e_x (+ a treated-only step in the power cells); e_x, e_c independent AR(1) with rho_i, sd 1. Date at 50%.
Arms: `plain` (round 5 on the treated series alone) and `difference`.

| Cell | n | common | rho_i | confounder |
|---|---|---|---|---|
| S1 | 120 | AR(1) 0.9 | 0.4 | shared slope change 0.05 per step |
| S2 | 120 | walk | 0.4 | shared step 2 |
| S3 | 60 | walk | 0 | none |
| S4 | 40 | AR(1) 0.8 | 0.4 | none |
| S5 | 120 | AR(1) 0.5 | 0 | none |
| S6 | 120 | walk | 0.4 | none; control = 2 C + e_c (a control on another scale) |
| P1 | 120 | walk | 0.4 | none; treated step 2 |
| P2 | 120 | AR(1) 0.9 | 0.4 | shared slope 0.05; treated step 2 |
| P3 | 40 | AR(1) 0.8 | 0.4 | none; treated step 2 |

**Exploratory run** (seed base 61000, 200 pairs, 199 replicates; `eval/known-date-control-explore.out.txt`): difference
size 6.0, 3.5, 6.5, 5.6, 4.0% in S1-S5 with 196-200 of 200 tested; plain 10.6, 21.3, 22.0, 3.1, 9.0% of those it
tested, refusing 59 and 80 of 200 in S2 and S3. S6: difference 23.2% (a control on another scale does not cancel).
Power: difference 55.5, 49.0, 17.3% of all pairs in P1-P3; plain 15.0, 22.5, 4.5%.

**Bars (confirmatory, seed base 67000, 400 pairs, 199 replicates;
`KD_SEED_BASE=67000 node eval/known-date-control-sim.mjs 400 199 plain,difference`).**

1. Size, difference arm, at p <= 0.05: at most 8% and at least 2% of tested pairs in each of S1-S5.
2. Coverage: the difference arm tests (neither refused nor cut-admitted) at least 90% of pairs in each of S1-S5.
3. Power, difference arm, share of all pairs: P1 at least 40%, P2 at least 35%, P3 at least 10%; and above the plain
   arm's share of all pairs in each.
4. Real pairs (`node eval/known-date-control-real.mjs`, 999 replicates, logs, monthly seasons):
   - R1 drivers minus rear-seat passengers at 1983-02: step p <= 0.01, step between -0.40 and -0.10, slope-change
     p > 0.05. **Seen during development** (step -0.277, p 0.001; slope-change p 0.95), so it is a check, not a test.
   - R2 front-seat passengers minus rear at 1983-02: step p <= 0.01, step < 0, slope-change p > 0.05. **Seen** (step
     -0.360, slope-change p 0.86).
   - R3 placebo: drivers minus rear on the rows before 1983-02, dates 1974-01, 1977-01, 1980-01: at most 1 of 3 with
     joint p <= 0.05 (refused or cut-admitted counts as no rejection). Not yet run.
   - R4 placebo: male minus female lung-disease deaths (UK 1974-1979, logs, monthly seasons), dates 1976-01 and 1977-01:
     at most 1 of 2 with joint p <= 0.05. Not yet run.

If 1-4 hold, `--control` ships in the CLI, `analyze()` and the page with the difference arm. If any fails, nothing ships
and the README says which. Reported without a bar: S6 (expected to fail; the CLI text says a control must be in the same
units, or logged), the plain arm's numbers, and the F-table p.
