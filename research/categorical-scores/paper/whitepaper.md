# Proper scores for K-ary verifier reports: Brier, spherical and log compared

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verifiers of decentralised ML jobs often report a distribution over K outcomes (e.g. which of K fault classes occurred), not a single fault probability. We compare the three standard strictly proper scores on the simplex: Brier `Σ(r_j−1[j=y])²` (range 2), spherical `1−r_y/‖r‖` (range 1) and log `−ln r_y` (unbounded). We give exact regrets, exact worst-case regrets (`1−2p_min+‖p‖²` for Brier, `‖p‖−p_min` for spherical, both attained at a vertex), and local curvature: Brier `‖δ‖²`, spherical `‖δ_⊥‖²/(2‖p‖)` with `δ_⊥` the component of the perturbation orthogonal to `p`, log `Σδ_j²/(2p_j)`. Per unit of payment range, spherical beats Brier by exactly `√K` at a uniform truth. Both bounded scores are nearly blind to a dropped rare class, where log is not. Standard Bregman/proper-scoring facts applied to this setting; not new theory. This is the multiclass follow-up left open in `tangent-log`.

## 1. Setup
A verifier reports `r` on the simplex; the outcome is drawn from `p`. Regret is expected loss of `r` minus that of `p`. Brier regret is `‖r−p‖²`; log regret is `KL(p‖r)`; spherical regret is `‖p‖−p·r/‖r‖ = ‖p‖(1−cos θ)`, θ the angle between `p` and `r`. All three are matched to direct enumeration (tests, error 1e-12) and are strictly positive for `r≠p` on random simplex points.

## 2. Worst-case regret is exact
`p·r/‖r‖` is quasi-concave in `r` (its superlevel sets are second-order cones), so its minimum over the simplex is at a vertex; Brier regret is convex, so its maximum is at a vertex too. Hence `max_r` regret is `1−2p_min+‖p‖²` (Brier) and `‖p‖−p_min` (spherical). Random search never exceeds them and the vertex values equal them. E1 (K=5): uniform truth 0.800 vs 0.247; rare class ρ=0.001: 1.248 vs 0.499; log is infinite. Relative to range (2 and 1) spherical's worst regret is about 0.25–0.5 of its range against 0.40–0.62 for Brier.

## 3. Local curvature and range-normalised incentive
For a perturbation `δ` with `Σδ=0`: Brier regret `≈‖δ‖²`; spherical `≈‖δ_⊥‖²/(2‖p‖)`; log `≈Σδ_j²/(2p_j)` (checked against the exact regret at small ε; the tests assert agreement to 0.5%, the observed error is about 3e-4). Dividing by payment range (Brier 2, spherical 1), at a uniform truth `‖p‖=1/√K` and `δ⟂p`, so the ratio of spherical to Brier incentive per range is exactly `√K` (E3: 1.414, 2, 3, 4, 10 for K=2, 4, 9, 16, 100). At a rare-class truth (K=5) moving mass between classes 0 and 1 has ratio 1.4–2.2 (E2). The advantage is real but it is bounded by `√K`. It comes from the `1/‖p‖` factor in the spherical curvature: per unit of range the ratio is `(‖δ_⊥‖²/‖δ‖²)/‖p‖`, at most `1/‖p‖`, which is `√K` at the uniform truth, the point of smallest `‖p‖`.

## 4. Rare classes: bounded scores ignore them
Log curvature for that shift is `(1/p_0+1/p_1)/2`: 5.0 at ρ=0.5 up to 502 at ρ=0.001. Brier stays at 1 (per range) for every ρ, and spherical at 1.39–2.24 (E2). E4: a verifier that zeroes out a class of mass ρ (and renormalises) loses 1.25e-4 (Brier), 1.0e-4 (spherical) and 0.151 (log) at ρ=0.01. The Brier figure is `ρ²K/(K−1)` exactly. The log figure is not a property of the score alone: it depends on the floor `ε` reported for the dropped class (E4 uses `ε = 1e-9`), with leading term `ρ ln(ρ/ε)`, so it is 0.29 at `ε = 1e-15` and infinite at `ε = 0`. The bounded and unbounded regrets are also in different units, so the comparison says that log punishes the drop and the bounded scores barely do, not by how much more. The bounded scores therefore give almost no incentive to model rare classes; that is what a bounded-range, stake-coverable rare-class score has to fix, e.g. the tangent extension of `tangent-log` applied to the multiclass log generator, which is not tested here.

## 5. Prior work
None of the results above is new; this note collects them for the K-ary verifier setting. Regret of a proper score as a Bregman divergence of its entropy (so `‖r−p‖²` for Brier and `KL(p‖r)` for log) is in Savage (1971) and Gneiting and Raftery (2007). Bickel (2007) compares the quadratic, spherical and logarithmic rules head to head, and Jose, Nau and Winkler (2008) place all three in one family of generalised entropies. Selten (1998) characterises the quadratic rule axiomatically and discusses its insensitivity to small probabilities. Normalising a score's incentive by its payment range is the setting of Neyman, Noarov and Weinberg (2021) and Hartline, Shan, Li and Wu (2022). What this note adds is the closed forms worked for this setting and the numbers in E1 to E4.

- L. J. Savage (1971). Elicitation of personal probabilities and expectations. *Journal of the American Statistical Association* 66(336).
- T. Gneiting and A. E. Raftery (2007). Strictly proper scoring rules, prediction, and estimation. *Journal of the American Statistical Association* 102(477).
- J. E. Bickel (2007). Some comparisons among quadratic, spherical, and logarithmic scoring rules. *Decision Analysis* 4(2).
- V. R. R. Jose, R. F. Nau and R. L. Winkler (2008). Scoring rules, generalized entropy, and utility maximization. *Operations Research* 56(5).
- R. Selten (1998). Axiomatic characterization of the quadratic scoring rule. *Experimental Economics* 1(1).
- E. Neyman, G. Noarov and S. M. Weinberg (2021). Binary scoring rules that incentivize precision. *ACM Conference on Economics and Computation (EC)*.
- J. D. Hartline, L. Shan, Y. Li and Y. Wu (2022). Optimization of scoring rules. *ACM Conference on Economics and Computation (EC)*.

## 6. Limits
Risk-neutral verifiers; a single report per task; exact truth distribution known to the analysis. The comparison is per unit of payment range, not per unit of expected payment. Related in this repo: `tangent-log`, `score-recalibration`, `quantized-reports`, `risk-averse-scoring`.
