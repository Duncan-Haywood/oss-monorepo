# Auditing sampled Shapley payments for training contributors

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Data or compute contributors are often paid their Shapley value, which costs `2^n` evaluations, so payers sample. Who can then check that the sampling is good enough, and which sampler should be used? In the saturating game `v(S)=1−exp(−Σ_{i∈S}w_i)` the marginal of `i` after predecessors `P` is `e^{−W(P)}(1−e^{−w_i})`, so every estimator variance is computable exactly by enumeration (n ≤ 10). We find: (i) permutation sampling is exactly efficient in every run (payments telescope to `v(N)`) but has the largest variance; (ii) size-stratified sampling has 5.9–8.5× lower variance at equal marginal evaluations, and is exactly zero-variance when contributors are equal, but its payments miss `v(N)` by up to 0.068 (of 0.9965) in a run; (iii) reversing each permutation (antithetic) lowers RMSE from 0.0181 to 0.0112 at no extra cost and stays efficient; (iv) the Hoeffding permutation count for a max-error guarantee is 4–5× larger than what is empirically needed; (v) to pick the top 3 of 8 payees correctly, stratified sampling needs about 4× fewer samples (0.99 at m=32, vs 0.97 for permutation at m=128).

## 1. Setup
`v` is monotone, submodular, `v(∅)=0`, with marginals in [0,1]. `φ_i=Σ_{P∌i}|P|!(n−|P|−1)!/n!·m_i(P)`. Permutation sampling draws `m` permutations and averages each player's marginal at its position; per-player variance is `(E[m_i²]−φ_i²)/m`, where `E[m_i²]` is the exact sum over predecessor sets weighted by the Shapley weights (`perm_var`). Stratified sampling draws `m/n` uniform predecessor sets of each size `k` and averages the size means; its variance is `(1/n²)Σ_k Var_k/(m/n)` (`strat_var`). Both use `m` marginal evaluations per player.

## 2. Exactness of the predictions
E2 (spread weights, m=96, 600 runs): simulated RMSE / predicted is 0.989 for permutation and 0.998 for stratified sampling. So a payer who knows an upper bound on the game's variance can size the sample without guessing.

## 3. Stratification gain and its price
E1: variance ratio permutation/stratified is 5.9 (spread weights), 8.4 (one whale, seven small), 8.5 (nine dust, one large). When contributors are equal, marginal depends only on position, so stratified variance is exactly 0 (tested) while permutation sampling still has RMSE 0.0103 at m=96. The reason is that the permutation's variance comes almost entirely from *which size* of predecessor set a random permutation draws, which stratification fixes deterministically.

Price: stratified estimates are independent across players, so the payments do not sum to `v(N)`. E3: mean gap +0.00001 but worst run 0.068 (7% of the pot). The payer either rescales (introducing a small bias) or leaves budget unspent or overspent. Permutation sampling has gap exactly 0 in every run, which matters when the pot is a fixed budget and any surplus is a liability.

## 4. Antithetic permutations
Using each random permutation and its reverse pairs a late position with an early one. With the same 96 evaluations per player, RMSE falls from 0.0181 to 0.0112 (1.6×, variance 2.6×), and efficiency is preserved because each reversed permutation also telescopes. In this submodular game marginals are monotonically decreasing in position, so the pair is negatively correlated; we do not claim this for non-monotone games.

## 5. How many samples to promise
E4: for a max-error guarantee `ε` at `δ=0.05` over n=8 players, Hoeffding gives `ln(2n/δ)/(2ε²)`: 1154, 7211, 28842 permutations for ε=0.05, 0.02, 0.01. The 95th percentile of the max error meets ε with 256, 2048, 8192 (power-of-two grid), so the bound is 4–5× conservative. Since payments only matter through ranking and thresholds, E5 asks a decision question: choose the top-3 payees. Stratified sampling picks correctly 0.87 / 0.99 / 1.00 at m=8/32/128, permutation 0.43 / 0.79 / 0.97.

## 6. Limits
One stylised game (exponential saturation), n ≤ 10 so that enumeration gives exact variances; larger n uses the same estimators but the variances are then estimated. Independent (not shared) strata across players; the stratified estimator's efficiency gap could be reduced by joint sampling but we did not study this. No strategic behaviour by contributors (replication and splitting are studied in `data-valuation-replication` and `sybil-stake`). Related: `data-valuation-replication`, `audit-allocation`, `holdout-market`.
