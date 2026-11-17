# Pre-registration: in-time placebos beside the known-date test (2026-11-17)

Written after an exploratory run (seed base 81000, below) and before the confirmatory run (fresh seed base **87000**)
and before the real series in `eval/known-date-placebo-real.mjs` are run. Committed on its own before either starts.

**Why.** The control-series round (README "A control series") failed its real placebo bar: the same test, run at
dates before the seat-belt law in the drivers-to-rear ratio, fired 3 of 3 times, because a straight line was the
wrong baseline for that ratio over 14 years. Its "Next" asked for "an in-time placebo check that ships beside the test
(the same test at dates in the before-period; refuse or warn when they fire)". This is that check, for the shipped
test on one series (no control).

**Change (one).** `placeboCheck(x, k, { period })` in `known-date.mjs`: the before-period `x[0..k-1]` alone, the
shipped test (matched rho, gated upper bound at 0.5, cut guard, 199 replicates) at up to three dates spread evenly
through it, each with `8 + period` points on both sides inside the before-period. It **warns** when at least 2 of the
tested placebo dates have joint p <= 0.05 (a refused date is not tested). It is a warning beside the named-date
result, not a change to the named-date p.

**Exploratory run** (seed base 81000, 100 series per cell, `eval/known-date-placebo-explore.out.txt`; the simulation is
`eval/known-date-placebo-sim.mjs`: AR(1) noise, innovation sd 1, about 0.05 t; cells 0-13 straight lines, 14 a real
2 sd step at the date, 15-22 a quadratic bend `curve * (t/(n-1))^2` with no change at the date, 23-26 a 3 sd step at
40% of the before-period with no change at the date):

- Straight lines (cells 0-14): warned 0-6% of tested series (6% in the step-at-the-date cell, whose before-period is
  a straight line; 0-4% elsewhere). "Any placebo fired" was 0-15%, too often for a warning, and a Bonferroni min-p
  rule behaved like 2-of-3 (0-5%), so 2-of-3 is kept.
- Bends: warned 26% and 85% at n 120, rho 0 (curve 4, 8), 9% and 27% at rho 0.4, but only 5-28% at n 240 with the date
  at 50%, where most of a quadratic's bending happens after the date and the placebos cannot see it.
- Early shocks: warned 41% (n 120) and 94% (n 240) at rho 0; 3% and 30% at rho 0.4.
- Among named-date rejections in cells 15-26 (all of them false: no change at the date), 323 of 926 (35%) were warned.

**Bars (confirmatory, seed base 87000, 200 series per cell, 199 replicates;
`KD_SEED_BASE=87000 KD_SHARD=i/4 node eval/known-date-placebo-sim.mjs 200 199` for i = 0..3, concatenated).**

1. False warnings: at most 8% of tested series in each of cells 0-14.
2. Warnings where the before-period is not a line: cell 16 (curve 8, n 120, rho 0) at least 70%; cell 25 (early 3 sd,
   n 240, rho 0) at least 80%; cell 23 (early 3 sd, n 120, rho 0) at least 25%.
3. Among named-date rejections pooled over cells 15-26, at least 25% warned.
4. Real series (`node eval/known-date-placebo-real.mjs`):
   - R4 drivers / rear-seat passengers, logs, 12 seasons, before 1983-02: warns. **Seen** in development (the control
     round's diagnosis fired at 1974-01, 1977-01 and 1980-01; these placebo dates differ), so it is a check.
   - R5 Nile before 1899, F3 and F4 Nottingham temperatures before 1935-01 and 1930-01 (12 seasons): no warning in any
     of the three. Not yet run with this check.
   - Reported without a bar: R1-R3 (drivers, front and rear passengers alone; the 1973-74 fuel crisis is a real shock
     in their before-period, so a warning there would be right, not a false alarm) and F1-F2 (Australian cement and cafe
     turnover before the GST of July 2000: long before-periods that may not be lines).

If 1-4 hold, the check ships beside `--known-date` (CLI text and `--json` field `placebo`), in `analyze({ knownDate })`
and on the page, with the limit stated: it sees only the before-period, so it misses a bend that grows after the date
(cells 19-22). If any fails, nothing ships and `placeboCheck` stays as an off-by-default function for the table.
