# Pre-registration: step or bend as two bootstrap tests, with "unclear" (2026-11-15, after the RSS check failed)

Written and committed before the fresh-seed run and the real run below. The code (`stepOrBendTest` in
`hinge-test.mjs`) exists; it was looked at on the **development** seeds of the failed check (61,000,000 on,
`eval/hinge-step-or-bend-sim.mjs` cells, 99 replicates), which are not reused here.

**Why.** `stepOrBend` (README, "Step or bend?") calls whichever kind has the smaller residual sum of squares, so it
calls a kind even when the two fit equally, and at rho 0.5 it called most real bends steps. The repair the README
named: call only when the data clearly favour one kind, else "unclear".

**Method.** T = log(step RSS / bend RSS), each fitted with Prais-Winsten rho read from the OLS hinge (as the hinge
test does). Two parametric bootstraps, each rerunning the whole procedure: under the best OLS step plus AR(1) noise
(bias-corrected rho and innovation sd of that step's residuals), pStep = share of replicates with T at least as large;
under the best OLS bend likewise, pBend = share with T at most as large. Call `bend` when pStep <= 0.05 < pBend,
`step` when pBend <= 0.05 < pStep, else `unclear`. Guard: refused under 30 points, or when the OLS step's and the OLS
bend's residuals both have bias-corrected rho above 0.9 (0.7 under 100 points). 199 replicates per null.

**What the development seeds showed (and why the bars below are unconditional).** Among series where the hinge
test rejected, wrong calls were 9 of 28 (step 2, n 100, rho 0.5) and 10 of 41 (step 2, n 145, rho 0.5); over all
series in the second cell they were 11 of 200. So the check is roughly calibrated on its own but not after
selecting on the hinge test's rejection: the hinge test fires on a sticky step mostly when the noise happens to
bend it. The check is therefore proposed as a **standalone** option (`--step-or-bend`), not as a verdict printed
under a rejected hinge test, and the bars count all series the check does not refuse.

**Synthetic cells** (line 0.02 t plus Gaussian AR(1) noise, innovation sd 1, change at 60% of n, 200 series per cell,
seeds from 62,000,000, never used before; `node eval/hinge-step-or-bend-boot-sim.mjs 200 199`):

- step 1, 2, 3 at n 100 rho 0.5; step 2 at n 145 rho 0.5; step 2 at n 100 rho 0;
- bend 0.04, 0.08 at n 100 rho 0.5; bend 0.04 at n 145 rho 0.5; bend 0.08 at n 100 rho 0;
- no change at n 100 rho 0, n 100 rho 0.5, n 145 rho 0.5;
- random walk with drift 0.02 (step sd 1) at n 100 and n 145.

**Bars (all must hold for `--step-or-bend` to ship in the CLI; the page and `analyze` are not touched this round):**

- W (wrong calls). In each step cell of size 2 or 3 the share of tested series called `bend` is at most 8%; in each
  bend cell of 0.08 the share called `step` is at most 8%.
- N (no change). In each no-change cell, `step` and `bend` calls are each at most 8% of tested series.
- RW (random walks). In each random-walk cell, calls of either kind are at most 10% of **all** series (refusals
  count as no call).
- U (useful). Step 2 at n 100 rho 0 is called `step` in at least 50% of tested series, and bend 0.08 at n 100 rho 0
  is called `bend` in at least 50%.
- R (real; recalled kinds, plausibility labels; 999 replicates, seed 1; `node eval/hinge-step-or-bend-boot-real.mjs`):
  Nile 1871-1970 is called `step`. GCAG 1880-2024, GISTEMP 1880-2024 and GCAG 1850-2024 (one piece of evidence:
  they share readings) are not called `step` (`bend` or `unclear` both pass).

Reported, deciding nothing: step 1 and bend 0.04 cells; the calls among the series the hinge test rejects at
p <= 0.05 (99 replicates), to see whether the selection effect holds on fresh seeds; the 8 real series of the earlier
predictions (refusal or call). Whatever happens, the README records it.
