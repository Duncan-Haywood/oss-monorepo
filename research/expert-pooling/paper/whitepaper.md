# Pooling modular experts: how much should a router extremize?

*Working note, MIT licensed. Stylised; numerical experiments in pure Python, no claims about any deployed protocol.*

## Motivation
In modular, decentralised learning (see `market-routing`, `wagering-modular-experts`) a router combines probability
reports from experts run on different devices. Experts that share pre-training data make correlated errors, so
"more experts" is not "more independent evidence". Two standard rules sit at the extremes: the geometric pool
(average logits, `a=1`) is safe but under-confident with independent experts; the naive Bayes sum (`a=n`) is optimal
for independent experts and badly over-confident otherwise. How much should the pool extremize as a function of
the correlation ρ, and what does it cost to get it wrong?

## Model
`y∈{±1}` uniform; expert `i` sees `x_i = μy + e_i`, `e ~ N(0, σ²R)` with `R` equicorrelated (correlation ρ), and reports
its calibrated own-posterior logit `l_i = 2μx_i/σ²`. Given `y=+1`, `l_i ~ N(s²/2, s²)`, `s² = (2μ/σ)²`. The pool is
`p = sigmoid(a · l̄)`, `l̄ = mean l_i`; loss is log-loss (a proper scoring rule, so this is also the wagering-style payoff).

## Results (`src/expert_pooling/model.py`, `experiments/results.txt`)
**R1 (closed-form extremization).** The Bayes posterior logit is `2μ·1ᵀΣ⁻¹x/σ²`; for equicorrelated Σ,
`1ᵀΣ⁻¹x = Σx/(σ²(1+(n−1)ρ))`, so `L_Bayes = n·l̄/(1+(n−1)ρ)`: **a\* = n/(1+(n−1)ρ) = n_eff**, interpolating between
`n` (ρ=0) and `1` (ρ=1). Expected loss is computed by exact quadrature (`l̄ | y ~ N(s²/2, s²(1+(n−1)ρ)/n)`), and a
ternary-search argmin of that loss (which does not use the formula) agrees with `a*` to 4 digits over 12 (n,ρ) pairs (E1).

**R2 (saturation).** Since `n_eff → 1/ρ`, adding experts stops helping: at ρ=0.2 the Bayes loss falls 0.492 → 0.220
(n=10) → 0.160 (n=50) → 0.144 (n=1000), with `n_eff` capped at 5 (E2). Diversity of training data, not expert count,
is the scarce resource.

**R3 (rules compared, Monte Carlo, n=8).** At ρ=0.3 mean log-loss is: linear pool 0.423, geometric 0.390, naive sum
0.511, `a=a*` 0.302 vs Bayes 0.297. At ρ=0.9 the naive sum scores 1.516, far worse than the 0.693 of predicting ½
(E3). The linear pool is dominated by the geometric pool throughout.

**R4 (asymmetric robustness).** With `a = k·a*` (n=8, ρ=0.3), excess loss is 0.052 at k=½ but 0.070 at k=2, and
0.160 vs 0.321 at k=¼ vs 4 (E4): over-extremizing is costlier than under-extremizing by the same factor, so when ρ is
uncertain, err toward a smaller `a`. Naive independence (`a=n`) loses 0.006 at ρ=0.05 but 0.323 at ρ=0.4, while
ignoring extremization (`a=1`) loses 0.236 at ρ=0.05 (E5); neither fixed rule is safe.

**R5 (learnable).** ρ is identified from labelled logits by a within-label moment estimator: mean 0.402/0.400 with sd
0.019/0.006 at T=10³/10⁴ (true 0.4; E6). Online gradient descent on `a` (convex in `a`) reaches 1.926 vs
`a*`=1.923 at T=10⁵ with average regret 7·10⁻⁵ against the best fixed exponent (E7).

## Implications
1. Routers over experts with shared provenance should scale pooled logits by an *effective count* estimated from
   logit covariance, not by `n`; `n_eff` is a natural reputational quantity (cf. the fixed-share tax in
   `wagering-modular-experts`, which addresses a different failure of the same router).
2. Expert-admission incentives should reward *decorrelated* information: the marginal value of a new expert is
   the change in `n_eff`, which is zero for an exact copy and can be paid on labelled rounds.
3. Verifiability: `a` is a single scalar a verifier can recompute from committed logits (cf. `reproducible-refereed-training`).

## Limitations
Equicorrelated Gaussian signals, a symmetric binary label, and calibrated experts that report their own posterior.
Real logit correlations are heterogeneous (a full covariance would give weights `Σ⁻¹1` rather than a scalar), experts
may be miscalibrated or strategic, and label-free identification of ρ (needed when labels arrive late) is open. Related
directions (aggregation, proper scoring, wagering) follow work of Frongillo, Waggoner and coauthors; this note is an
independent numerical exercise and no results are attributed to them.
