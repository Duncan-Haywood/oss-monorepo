# Two looks make a variance: multi-observation elicitation of drift tolerances

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verifiable ML training needs a tolerance for benign numerical drift, and drift *variance* is the natural quantity for a verifier to report. Variance is not elicitable from one observation (its level sets are not convex), so a score on a single re-execution cannot pay for it. Following the multi-observation view of elicitation, we show two independent re-executions suffice and work out the economics. (i) `D = (y₁−y₂)²/2` is unbiased for `σ²` with `Var(D) = σ⁴(κ+1)/2` (κ the kurtosis; matched on uniform, Gaussian, Laplace, exponential to 2%). (ii) Applied to `D`, the Brier loss has exact excess `(r−σ²)²`, and the scale-free Itakura–Saito loss `D/r + ln r` has exact excess `1/λ + ln λ − 1` for a report `λσ²`: understating by half costs 0.307, overstating by 2× only 0.193. (iii) To make an honest verifier beat a `λ`-misreporter with probability `1−δ` takes `m ≈ 2z_δ²(κ+1)/(λ−1)²` tasks (2 309 for a 10% error, Gaussian, δ=5%; simulated win rate 0.93–0.97 at the exact CLT count). (iv) Given `n` observations per task, averaging `n/2` disjoint pairs is `≈ 1.8×` worse (n=10, Gaussian) than the unbiased sample variance; the ratio is `2(n−1)/n`. (v) With Pareto tail index `α<4`, `Var(D)` is infinite and the error decays like `m^{−(1−2/α)}` instead of `m^{−1/2}`, so payments on heavy-tailed drift do not concentrate. Exact algebra plus seeded simulation; stylised.

## 1. Why two observations
A property is elicitable from one observation only if its level sets are convex. `N(0,1)` and `N(2,1)` both have variance 1 but their 50/50 mixture has variance 2, so no score on a single `y` elicits the variance (property-elicitation-verification in this repo makes the same point for tolerance pricing). Two independent draws change the target: `E[(y₁−y₂)²/2] = σ²` for any distribution with finite variance, so any strictly proper score for the *mean* of `D` elicits `σ²`. A known-mean shortcut `(y−μ₀)²` instead elicits `σ² + (μ−μ₀)²`, biased by the squared error of the assumed centre (0.25 for a 0.5 gap at `σ=1`).

## 2. Exact costs of misreporting
Reporting `r = λσ²`: Brier `S = (r−D)²` has expected excess `(r−σ²)²`. Itakura–Saito `S = D/r + ln r` is a proper score for the mean of `D`, is invariant to units, and has excess `e(λ) = 1/λ + ln λ − 1`, which is `≈(λ−1)²/2` near 1 but asymmetric: `e(½) = 0.307`, `e(2) = 0.193`. A drift tolerance reported too small triggers false slashes, so the scale-free loss penalises the harmful side harder. E3 matches all exact values within 1% (2·10⁵ pairs).

## 3. How many tasks to tell truth from a misreport
The per-task loss gap between `λσ²` and `σ²` is `(D/σ²)(1/λ−1) + ln λ`, with mean `e(λ)` and standard deviation `|1/λ−1|√((κ+1)/2)`. By the CLT the honest total wins with probability `Φ(√m·e(λ)/sd)`, so
`m = z_δ² · (1/λ−1)²(κ+1)/2 / e(λ)² ≈ 2z_δ²(κ+1)/(λ−1)²`.
Gaussian (`κ=3`), `δ=5%`: 116, 405, 2 309 tasks for `λ = 1.5, 1.25, 1.1`, and 469 for `λ=0.8`. Simulated win rates at those counts are 0.968, 0.950, 0.960, 0.948; Laplace (`κ=6`) needs 1.75× more (203, 708, 4 041, 821) and wins 0.94, 0.93, 0.96, 0.96. The first-order form understates by up to 25% at `λ=1.5`. Precision is quadratic: a verifier who may shade its report by 10% cannot be caught with fewer than thousands of tasks, which sets how fine a tolerance market can be.

## 4. More than two observations
With `n` observations per task, the unbiased sample variance has `Var = σ⁴(κ − (n−3)/(n−1))/n`; averaging `n/2` disjoint-pair statistics has `Var = σ⁴(κ+1)/n`. Their ratio is `(κ+1)/(κ−(n−3)/(n−1))`, which for Gaussian data is `2(n−1)/n`: 1.80 at `n=10` (simulated 1.804), 2 as `n→∞`. Pairs are the easy way to *prove* elicitability but waste half the information; a mechanism should score the full U-statistic (with Itakura–Saito on the sample variance) whenever the observations are exchangeable.

## 5. Heavy tails
`Var(D)` is finite only if `E y⁴ < ∞`. For Pareto observations with `α=6, 3, 2.2` the median relative error of the mean of `m` pair statistics at `m = 10²…10⁵` is 0.238→0.010, 0.414→0.065, 0.757→0.442 (E6): `α=6` follows `m^{−1/2}`, `α=3` decays near `m^{−1/3}` (theory `m^{−(1−2/α)}`), and `α=2.2` barely moves. Payment noise then dominates the incentive gap of §3: the `m` in the formula is not finite. Bounded or trimmed statistics fix the noise but give up elicitation of the true variance; the tail-risk-elicitation project prices that trade for quantiles and expected shortfall.

## 6. Limitations
(1) Observations are independent draws from one distribution; real re-executions share a base computation and may be positively correlated, which shrinks `Var` of `D` but biases it (it estimates the within-run, not total, variance). (2) Misreport is a fixed factor `λ`; the verifier can also tilt across tasks. (3) The CLT count is asymptotic and simulated only for Gaussian and Laplace. (4) Not an analysis of any deployed protocol. Contributions: the two-observation scheme for drift variance with exact Brier and scale-free excess losses; closed-form detection sample size; exact pairs-versus-U-statistic loss; where the payment-noise argument fails.

## Reproduce
```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 experiments/run.py
```
