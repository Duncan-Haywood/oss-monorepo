# Randomized twin: what domain randomization buys, and what it does not

*Stylised: scalar LQ plant `a=0.9, q=1, r=0.1, σ²=1`, twin input gain `b̂=1`, uncertainty only in the input gain `b ~ U[b̂(1−ε), b̂(1+ε)]`, `ε<1`; one gain trained on the randomised objective (64-point Gauss–Legendre quadrature of the exact cost), deployed on the true plant. Pure Python; see `tests/` and `experiments/results.txt`.*

## Question
Domain randomization trains a policy across a distribution of twin parameters so it survives the sim-to-real gap. In the smallest model where the cost is exact: how wide should the randomization be, what does it cost when the twin was right, does it protect against the worst case, and where does it fail?

## Exact results
1. **A cliff makes wide training objectives infinite.** A gain `k>0` is stable for all `b` in the range iff `b̂(1+ε)k < 1+a`, so `ε < (1+a)/(b̂k) − 1` (checked). For `k=1.0, 1.25, 1.5, 1.75` the largest safe width is 0.90, 0.52, 0.27, 0.086. The nominal gain `k*=0.8233` tolerates a plant up to 2.31× the twin's `b̂`; the randomised objective evaluated at a gain beyond its cliff is `+∞`, so optimisation must search inside the stable set.
2. **The randomised gain is conservative and monotone in `ε`.** `k_ε` = 0.8233, 0.8216, 0.8164, 0.8082, 0.7846, 0.7548, 0.7200 at `ε` = 0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9. Small width: `k_ε − k* = −(εb̂)² J_kbb/(6 J_kk)`, accurate to 3·10⁻⁸ at `ε=0.02`, 10⁻⁴ at `0.2`, 5·10⁻³ at `0.5` (0.7368 vs 0.7548 at 0.7). The gain moves because the cost is more convex on the high-`b` (overshoot) side.
3. **The price when the twin was right is quartic in the width.** Regret at `b=b̂`: 6·10⁻⁵ (`ε=0.2`), 2.7·10⁻⁴ (0.3), 1.8·10⁻³ (0.5), 5.6·10⁻³ (0.7), 1.3·10⁻² (0.9); doubling `ε` multiplies it by 16 in the small-width range.
4. **It removes the cliff on the high side.** At `b=2.3b̂` the nominal gain has regret 83.9; `ε=0.3` gives 12.2, `0.6` gives 3.4, `0.9` gives 1.44. The gain's stability limit moves from 2.31 to 2.35, 2.47, 2.64 `b̂`: randomizing over a range pushes the cliff out by about 15%, not by the width.
5. **Uniform-average training is not minimax.** The worst regret over the training range is *worse* for the randomised gain than for the nominal one at every `ε ≤ 0.7` (0.059 vs 0.054 at `ε=0.3`; 0.415 vs 0.396 at 0.7) because the worst case sits at the low-`b` end, where a higher gain is needed and randomization lowers it; only at `ε=0.9`, where the high end is near the cliff, does it win (0.64 vs 0.89). The minimax gain is barely below nominal (0.8217 at `ε=0.3`, 0.8182 at 0.5) and beats both.
6. **The best width tracks the prior, and matters only when the prior reaches the cliff.** Against true `b/b̂ ~ U[·]` the mean-regret-optimal `ε` equals the half-width for symmetric priors (0.10, 0.30, 0.50 for `[0.9,1.1]`, `[0.7,1.3]`, `[0.5,1.5]`) but gains only 0–5% over nominal; for `[0.5, 2.0]` it picks 0.9 and halves mean regret (0.106 vs 0.226); for `[0.5, 2.4]` (past the nominal cliff) 0.31 vs 51.6.

## Limitations
One uncertain parameter, uniform prior, `a` known, certainty of the quadrature; nothing nonlinear or multi-dimensional. The worst-case conclusion (5) depends on which side of the range binds; with a different plant the asymmetry could reverse. Regret is measured against the clairvoyant gain for each plant.

## Relevance
Randomize just wide enough that the training range's high-gain end clears the plausible plant with margin; a moderate width costs almost nothing when the twin is right (quartic) and is decisive when the real system can exceed the nominal stability cliff, but it is a variance-style hedge, not a worst-case guarantee — if worst-case regret matters, optimise it directly (the minimax gain), and pair randomization with the real-data identification of `twin-transfer`.
