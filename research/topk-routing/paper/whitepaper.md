# Top-k routing as a capped Hedge market

**Abstract.** Sparse mixture-of-experts layers send each token to `k` of `N` experts. As online learning this is expert advice with a *distinctness* constraint: the router plays `p ∈ K = {p ∈ [0,1]^N : Σp = k}` and pays `⟨p,ℓ⟩`. The entropic (Hedge / LMSR-style) market on `K` prices expert `i` at `p_i = min(1, λ w_i)`, `w_i = e^{−ηL_i}`, where `λ` is a single shadow price setting total price to `k`. We give the exact projection, check regret against the best fixed `k`-set against `k ln(N/k)/η + ηTk/2` numerically, show why plain normalisation is not a valid play, and realise the prices as exactly `k` distinct experts by systematic sampling. This builds on `market-routing` (LMSR = Hedge) and `balanced-routing` (load prices).

## 1. Projection
Given positive `w`, the generalised-KL projection onto `K` is `p_i=min(1,λw_i)`: sort `w` descending; with `m` saturated experts `λ=(k−m)/Σ_{i>m}w_i`, valid iff `λ w_{(m+1)}≤1≤λ w_{(m)}`. Tests confirm feasibility, the KKT form on 200 random instances, and that no random feasible `q` has smaller `KL(q‖w)` than `p`. Suffix sums are used because subtracting from a running total produced a division by zero when weights spanned 22 orders of magnitude.

## 2. Regret
The lazy (FTRL) router plays `p_t = Π_K(e^{−ηL_{t−1}})`. The comparator is the best fixed `k`-set, whose entropic diameter from the uniform point `k/N` is `k ln(N/k)`, so the expected form is
`Regret ≤ k ln(N/k)/η + ηTk/2`, tuned `η=√(2 ln(N/k)/T)` giving `k√(2T ln(N/k))`.
We did **not** prove the constant; it is the standard entropic-FTRL/OMD bound transplanted to `K` (subset-selection Hedge is due to Warmuth–Kuzmin and Helmbold–Warmuth), and we check it. At `N=32, T=2000` (E1) regret was 61.6/197.8/308.8/439.3 (Bernoulli means `.3–.61`) for `k=1,4,8,16` against bounds 117.7/364.8/595.7/842.5; the "chase" stream (losses on the current `k` leaders; not adaptive to our router) gave far less regret (2–105), and the switching-block stream 61.8–359.5. E2 shows regret as a fraction of the bound falling from 0.58 (`k=1`) to 0.10 (`k=31`): the `ln(N/k)` factor collapses as `k→N`, and at `k=N` regret is exactly 0 because the play is forced.

## 3. Why the cap matters
Normalising `w` to sum `k` without capping gives prices above 1 whenever one expert dominates (282 of 300 rounds in E3): the play cannot be realised by a router that picks distinct experts, and its "loss" 167 is 3.2× below the feasible capped loss 530. Any report of routing loss that ignores the cap is understating cost. In market terms, the cap is a per-expert position limit and `λ` is its clearing price; in E5 (`k=4`, four good experts) `λ` rises 0.125→3.27 over 2000 rounds as 3 of the 4 good experts saturate, and the fourth slot is priced by the residual.

## 4. Realising k distinct experts
Madow systematic sampling (one uniform draw, cumulative prices, take indices where the running sum crosses `u+j`) returns exactly `k` distinct experts with inclusion probabilities exactly `p_i` (checked to 0.01 over 6×10⁴ draws). Independent Bernoulli draws have the same marginals but a random count. Realised-loss variance under systematic sampling was 0.0059 vs 0.0814 (loss sorted along the sampling order) and 0.0508 vs 0.4143 (shuffled) for independent draws (E4), i.e. 8–14× lower. Systematic-sampling variance depends on the order of experts; we report two orders, not a general law.

## 5. Limits
Losses in `[0,1]` chosen obliviously (the chase stream reacts to leaders, not to the router, so a truly adaptive adversary is untested); no load-balancing constraint (see `balanced-routing`), no gating-network parameters, no token-level batching; regret constant unproven; sampling regret adds a martingale term not analysed here. The comparison is against a fixed `k`-set, not a switching comparator (see `sleeping-ledger`).
