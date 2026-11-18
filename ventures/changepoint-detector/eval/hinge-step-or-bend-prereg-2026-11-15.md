# Pre-registration: "step or bend?" beside `--hinge-test`, and the test on fresh real series (2026-11-15, latest)

Written before any code for the check existed and before `--hinge-test` was run on any series named below.
Context: `hinge-test.mjs` and its report note both say "a step can pass for a hinge": the test asks
"one hinge against a straight line", so a level jump on a trend can reject the line and be reported as a change
of slope. Nothing in the output says which it was.

**Proposal (`stepOrBend`).** When the hinge test runs (not refused), fit, with the same Prais-Winsten rho
the test used and over the same knot range (15% trimmed at each end):

- the best hinge, `x = a + b t + c (t - k)+`, and
- the best single level step on the same line, `x = a + b t + d 1{t > k}`.

Both have three coefficients and one knot, so the smaller transformed residual sum of squares names the
better kind: `better: 'step' | 'bend'`, with the step's date and the ratio of the two sums. Nothing else is
used to decide (no OLS fallback, no second rule). The output says it beside the test; when `step` wins and
the test rejects, it says the small p may be a level step rather than a slope change.

**Fixed now.** Margin 0.15. Synthetic: `eval/hinge-step-or-bend-sim.mjs`, 200 series per cell, 99 bootstrap
replicates, seeds from 61,000,000 (never used before). Real: `eval/hinge-step-or-bend-real.mjs`, 999
replicates, seed 1.

**Synthetic cells** (line `0.02 t` plus Gaussian AR(1) noise, innovation sd 1, change at 60% of n):

- step of 1, 2, 3 (in innovation sd) at n 100, rho 0.5; step of 2 at n 145, rho 0.5 and at n 100, rho 0;
- slope change of 0.04 and 0.08 per step at n 100, rho 0.5; 0.04 at n 145, rho 0.5; 0.08 at n 100, rho 0.

**Bars (all must hold for the check to ship in the CLI, the report and the page):**

- SS. Among series in step cells of size 2 or 3 where the test rejects at p <= 0.05, the check says `step`
  in at least 85%, in every such cell with 30 or more rejections.
- SB. Among series in bend cells of 0.08 where the test rejects, the check says `bend` in at least 85%,
  in every such cell with 30 or more rejections.
- R. Real, recalled kinds (plausibility labels, not labelled data): Nile 1871-1970 (the 1898-99 drop) gives
  `step` if tested; GCAG 1880-2024, GISTEMP 1880-2024, GCAG 1850-2024 and GCAG 1930-2024 give `bend`.
  The four temperature series share most of their readings, so they count as one piece of evidence.

Reported, deciding nothing: step 1 and bend 0.04 cells (expected weak), the share of all series the test
rejects in each cell (the rate at which a pure step makes the hinge test reject is itself a finding).

**The test on series it has never been run on (predictions; they decide nothing about shipping,
they record whether the test reads documented shapes the way a reader would):**

- P1. Australian gas, annual totals 1956-1994 (39 values, `data/au-gas.csv`; the differences test gave
  p 0.048): tested, p <= 0.05, knot in 1966-1973, `bend`.
- P2. US electricity, annual totals 1973-2012 (40 values, `data/us-electricity.csv`; peak about 2007;
  the differences test gave p 0.10): tested, p <= 0.05, knot in 1998-2008.
- P3. US female murder rate 1950-2004 (55 values): tested, p <= 0.05, knot in 1975-1995, `bend`.
- P4. Lake Huron 1875-1972 (98 values, `data/lake-huron.csv`; usually modelled as a line plus AR noise):
  p > 0.05.
- P5. UK gas annual totals 1960-1986 (27 values): refused (under 30 points).
- Reported with no prediction: Canada fertility 1931-1968, Michigan-Huron 1918-2009, CO2 annual means
  1959-2025 (a smooth acceleration; any rejection is "not a line", not a date).

A refusal counts as a failed prediction where one says "tested". Whatever happens, the README records it.
