# Ranked probability scoring of ordered fault severities

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
When a verifier of a decentralised ML job reports a distribution over K *ordered* severities (none < minor drift < major drift < corrupted ...), the Brier score treats a one-step error and a K−1-step error identically. The ranked probability score (RPS) `Σ_{k<K−1}(R_k−1[y≤k])²`, with `R` the reported CDF, is Brier on the cumulative distribution. We give exact facts: RPS is strictly proper with regret `Σ_k(R_k−P_k)²`; a mass shift `ε` over distance `d` costs exactly `dε²` under RPS versus `2ε²` under Brier; the worst-case regret is attained at a vertex (closed form, at most K−1); pooling two adjacent classes into an equal split costs `((p_i−p_{i+1})/2)²`, exactly half of Brier's; and every threshold probability is within `√regret` of the truth. The limit is honest: per unit of payment range RPS gives Brier's incentive only for a maximal-distance shift, and less for everything else. Standard Bregman/proper-scoring facts applied to this setting; not new theory. Extends `categorical-scores`, which is order-blind.

## 1. Setup
Outcome `y∈{0..K−1}`, report `r` on the simplex, `R_k=r_0+…+r_k`. Brier loss `Σ_j(r_j−1[j=y])²` has range 2; RPS has range K−1. Because the map `r↦R_{0..K−2}` is a bijection onto its image and the RPS is Brier on `R` against the indicator CDF, RPS is strictly proper and its regret is `‖R−P‖²`. Matched to direct enumeration (tests, error 1e-12).

## 2. Distance sensitivity
Moving mass `ε` from class `i` to `j` shifts `|i−j|` cumulative entries by `ε`, so RPS regret is exactly `|i−j|ε²`; Brier regret is `2ε²` regardless. E1 (p=(.1,.2,.4,.2,.1), ε=0.04): Brier 0.0032 for every target, RPS 0.0016, 0.0032, 0.0048, 0.0064 for distances 1..4. Brier cannot rank a verifier that errs by a neighbour above one that errs by four steps; RPS does, with ratio exactly `d`.

## 3. The cost: incentive per unit of range
Dividing by payment range (Brier 2, RPS K−1), the per-range curvature is `ε²` for Brier and `dε²/(K−1)` for RPS. So RPS matches Brier only at maximal distance `d=K−1` and is `1/(K−1)` of it for adjacent shifts (E2: 0.25, 0.5, 0.75, 1.0 at K=5). Distance sensitivity is therefore not free: if fine adjacent-class resolution is what you need to pay for, Brier (or a finer per-range design) is stronger; RPS is right when far errors matter more than near ones. Worst-case regret (E3, K=5): symmetric truth 1.40 of range 4 (0.35); skewed truth 2.71 of 4 (0.68), against Brier 1.06/2 (0.53) and 1.32/2 (0.66).

## 4. Coarse-graining is cheap
A verifier that pools adjacent classes `i,i+1` into an equal split changes one cumulative entry by `(p_i−p_{i+1})/2`, so RPS regret is `((p_i−p_{i+1})/2)²`, while Brier regret is `(p_i−p_{i+1})²/2`: RPS is exactly half (E4). Pay for ordinal reports therefore tolerates coarse severity buckets twice as well as Brier at the same payment scale.

## 5. Threshold-decision transfer
An escalate-if-severity-≥k rule depends on `R_k`. Since `(R_k−P_k)²≤Σ_j(R_j−P_j)²`, each threshold probability is within `√regret` of the truth, so a cap on excess RPS certifies every threshold decision at once (E5: ratio of actual gap to bound up to 0.999 over 20,000 random reports; the bound is tight when one threshold carries all the error). Related: `decision-regret-transfer`.

## 6. Limits
Risk-neutral verifiers; one report per task; truth distribution known to the analysis; equal-spaced thresholds weighted equally (a weighted RPS `Σ w_k(R_k−P_k)²` keeps every result with `|i−j|` replaced by the weight sum along the path). Related in this repo: `categorical-scores`, `multiclass-tangent-log`, `crps-drift-scoring`.
