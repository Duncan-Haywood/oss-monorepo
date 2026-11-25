# Regression discontinuity

A scholarship for test scores of 80 and up, a subsidy for incomes under a
line, a seat for whoever wins by any margin: units just either side of a
cutoff are alike except for the side they landed on, so the **jump at the
cutoff** measures the effect. This tool estimates that jump the way the
current econometrics literature recommends, and runs the checks a referee
asks for:

- **Local polynomial RD** of order p (default local linear) on each side,
  triangular, Epanechnikov or uniform kernel.
- **Robust bias-corrected confidence intervals** (Calonico, Cattaneo &
  Titiunik 2014): the conventional, bias-corrected and robust estimates and
  standard errors, nearest-neighbour or HC0-HC3 variances.
- An **MSE-optimal bandwidth** (one h for both sides) and its bias pilot b,
  by this tool's own plug-in (Calonico, Cattaneo & Farrell 2020).
- **Fuzzy RD** for partial take-up: the outcome jump over the take-up jump,
  with a delta-method variance.
- Checks: a **bandwidth sweep** (0.5 to 2 times h), **placebo cutoffs** at the
  median of each side, **covariate balance**, the **McCrary (2008) density
  test** and window counts with exact binomial tests, and an **RD plot**.

**Live:** https://marisstella.app/regression-discontinuity/ (runs in your
browser; nothing is uploaded).

## Use it

```
node cli.mjs --example
node cli.mjs data.csv --running score --outcome y --cutoff 80 \
  [--treatment took_up] [--covariates age,prior] [--p 1] [--kernel triangular] \
  [--h H] [--b B] [--vce nn|hc0|hc1|hc2|hc3] [--alpha 0.05] [--csv|--json]
node platform/agents/tools.mjs call regression-discontinuity analyze --input '{"csv":"...","running":"score","outcome":"y","cutoff":80}'
```

Input: one row per unit; treatment is assigned at running >= cutoff.

## Method

Implemented from the papers; `PAPERS` in `engine.mjs` lists what was
implemented from each and every deviation (also on the page and in `--help`).
rdrobust (GPL-3.0) was used only as an external program to record reference
numbers; its source was not read or ported.

- Each side's fit is weighted least squares on r(u) = (1, u, ..., u^p),
  u = (x - c)/h, weights K(u)/h. Every estimate is written as an explicit
  linear combination of the outcomes, so variances are sums of
  weight^2 x residual variance.
- Bias correction: tau_bc = tau - (B+ - B-), B = e0' G^-1 Lambda (h/b)^(p+1)
  times the coefficient p+1 of an order q = p+1 fit at b. The robust variance
  uses the combined weights, so it includes the noise of the bias estimate.
- Residual variances: nearest-neighbour (J = 3 on the same side, ties at the
  J-th distance included, scaled by J/(J+1)), or HC0-HC3 from the order-p
  fit at h (conventional) and the order-q fit at b (robust). Only units
  within max(h, b) of the cutoff enter, and HC1's n is the count in that
  window, which is what rdrobust does.
- Fuzzy: tau = tau_Y / tau_D; the bias-corrected ratio linearises the bias of
  the ratio around the conventional jumps; variances by the delta method with
  the joint residuals.
- Bandwidth: pilot c = C_K min(sd, IQR/1.349) n^(-1/5); m^(q+2) from a global
  polynomial of order q+2; then d, b and h each minimise
  t^(2(k+1-nu)) (B^2 + 3R) + V / (n t^(2nu+1)) for the derivative they feed,
  with R the variance of the bias estimate (a regularisation).

## Verification

`node --test *.test.mjs` (48 tests, about 2 s).

**Against rdrobust 2.1.1** (Python; `eval/reference.py` writes
`eval/reference.json`): 14 fixed-bandwidth cases, sharp and fuzzy, p = 0 to 3,
all three kernels, nn and HC0-HC3, and an integer running variable with ties
(rdrobust's mass-point adjustment off). Every conventional, bias-corrected and
robust estimate and standard error agrees within 1e-8, and the counts inside
h are equal.

**How close the automatic bandwidth is.** The plug-in is this tool's own, so
it does not reproduce rdbwselect's `mserd`:

| Design | rdrobust h | this tool h | ratio |
|---|---|---|---|
| Lee example, p = 1 | 0.1870 | 0.1787 | 0.96 |
| Lee example, p = 2 | 0.2649 | 0.2518 | 0.95 |
| Lee example, uniform kernel | 0.1419 | 0.1403 | 0.99 |
| Placebo covariate | 0.2318 | 0.1931 | 0.83 |
| Fuzzy file, outcome | 0.2678 | 0.2823 | 1.05 |
| Integer score with ties | 7.8316 | 5.9113 | 0.75 |

A test holds every ratio between 0.7 and 1.1. To reproduce an rdrobust run
exactly, pass its h and b.

**Coverage.** `eval/coverage.mjs` draws 1,000 samples of 1,000 from the Lee
calibration (true jump 0.04, seed 7): at the automatic bandwidth the robust
95% interval covered the truth in 93.7% of draws and the conventional one in
91.7%, with average lengths 0.182 and 0.154. On the same 500 draws given to
both (`eval/same_draws.py`, then `eval/same-draws.mjs`), this tool's robust
interval covered 93.2% (mean h 0.172) and rdrobust's 91.8% (mean h 0.199);
conventional 91.0% and 89.2%. The Monte Carlo standard error of each coverage
figure is about 1.1 points.

Property tests: an exact linear design with a jump is recovered exactly for
every kernel; a quadratic curve on one side biases the local linear estimate
and the bias-corrected one removes it exactly; the fuzzy estimate equals the
ratio of the two sharp jumps; moving units across the cutoff is caught by the
density test while the example's sloped density is not; a discrete running
variable gets the mass-points note.

## What the example shows

1,000 simulated close elections (true jump 0.04). This draw gives a
conventional estimate of 0.088 at h = 0.179 (221 units inside h), robust 95%
CI 0.005 to 0.169: the interval covers the true 0.04 though the point
estimate is twice it, which is what a sample of this size near a cutoff
allows. The sweep keeps the estimate between 0.088 and 0.103; the placebo
cutoffs, the prior-share covariate and the density test show nothing
(p = 0.78, 0.76, 0.78 and 0.25).

## Limits

The effect is for units at the cutoff. No covariate adjustment, clustering,
multiple cutoffs or derivative (kink) designs yet; no mass-point adjustment
(the page notes discrete running variables). The density test is McCrary's
log-difference with his asymptotic standard error at twice h, not the local
polynomial density estimator of Cattaneo, Jansson & Ma (2020). Next:
covariate-adjusted RD (Calonico, Cattaneo, Farrell & Titiunik 2019), the
rddensity test, and local randomisation inference for discrete scores.

## Disclaimer

No warranty. Statistical estimates from data you supply; not legal, tax,
financial, medical or policy advice, and not proof of what caused an outcome.
Not affiliated with the authors of the cited papers or the rdrobust project.
FSL-1.1-MIT licence.
