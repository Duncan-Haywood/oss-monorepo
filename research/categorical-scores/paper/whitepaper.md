# Proper scores for K-ary verifier reports: Brier, spherical and log compared

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verifiers of decentralised ML jobs often report a distribution over K outcomes (e.g. which of K fault classes occurred), not a single fault probability. We compare the three standard strictly proper scores on the simplex: Brier `Σ(r_j−1[j=y])²` (range 2), spherical `1−r_y/‖r‖` (range 1) and log `−ln r_y` (unbounded). We give exact regrets, exact worst-case regrets (`1−2p_min+‖p‖²` for Brier, `‖p‖−p_min` for spherical, both attained at a vertex), and local curvature: Brier `‖δ‖²`, spherical `‖δ_⊥‖²/(2‖p‖)` with `δ_⊥` the component of the perturbation orthogonal to `p`, log `Σδ_j²/(2p_j)`. Per unit of payment range, spherical beats Brier by exactly `√K` at a uniform truth. Both bounded scores are nearly blind to a dropped rare class, where log is not. Standard Bregman/proper-scoring facts applied to this setting; not new theory. This is the multiclass follow-up left open in `tangent-log`.

## 1. Setup
A verifier reports `r` on the simplex; the outcome is drawn from `p`. Regret is expected loss of `r` minus that of `p`. Brier regret is `‖r−p‖²`; log regret is `KL(p‖r)`; spherical regret is `‖p‖−p·r/‖r‖ = ‖p‖(1−cos θ)`, θ the angle between `p` and `r`. All three are matched to direct enumeration (tests, error 1e-12) and are strictly positive for `r≠p` on random simplex points.

## 2. Worst-case regret is exact
`p·r/‖r‖` is quasi-concave in `r` (its superlevel sets are second-order cones), so its minimum over the simplex is at a vertex; Brier regret is convex, so its maximum is at a vertex too. Hence `max_r` regret is `1−2p_min+‖p‖²` (Brier) and `‖p‖−p_min` (spherical). Random search never exceeds them and the vertex values equal them. E1 (K=5): uniform truth 0.800 vs 0.247; rare class ρ=0.001: 1.248 vs 0.499; log is infinite. Relative to range (2 and 1) spherical's worst regret is about 0.25–0.5 of its range against 0.40–0.62 for Brier.

## 3. Local curvature and range-normalised incentive
For a perturbation `δ` with `Σδ=0`: Brier regret `≈‖δ‖²`; spherical `≈‖δ_⊥‖²/(2‖p‖)`; log `≈Σδ_j²/(2p_j)` (verified against finite differences to 0.1%). Dividing by payment range (Brier 2, spherical 1), at a uniform truth `‖p‖=1/√K` and `δ⟂p`, so the ratio of spherical to Brier incentive per range is exactly `√K` (E3: 1.414, 2, 3, 4, 10 for K=2, 4, 9, 16, 100). At a rare-class truth (K=5) moving mass between classes 0 and 1 has ratio 1.4–2.2 (E2). The advantage is real but it is bounded by `√K`, and the gap comes from spherical using its whole range while Brier uses `[0,2]` only at vertices.

## 4. Rare classes: bounded scores ignore them
Log curvature for that shift is `(1/p_0+1/p_1)/2`: 5.0 at ρ=0.5 up to 502 at ρ=0.001. Brier stays at 1 (per range) for every ρ, and spherical at 1.75–2.2. E4: a verifier that zeroes out a class of mass ρ (and renormalises) loses 1.25e-4 (Brier), 1.0e-4 (spherical) and 0.151 (log) at ρ=0.01. The bounded scores therefore give almost no incentive to model rare classes; that is what a bounded-range, stake-coverable rare-class score has to fix, e.g. the tangent extension of `tangent-log` applied to the multiclass log generator, which is not tested here.

## 5. Limits
Risk-neutral verifiers; a single report per task; exact truth distribution known to the analysis. The comparison is per unit of payment range, not per unit of expected payment. Related in this repo: `tangent-log`, `score-recalibration`, `quantized-reports`, `risk-averse-scoring`.
