# Cost-function markets as sparse routers for continual, modular learning

*Duncan Haywood — working note, MIT licensed. Code and tests: this directory.*

## Abstract

Cost-function prediction markets are online learning algorithms: the price
vector is the Follow-the-Regularised-Leader (FTRL) iterate on cumulative
trades, and the market maker's worst-case loss is the regret bound. We use
this dictionary to treat *expert routing* in modular networks as a market.
The entropic market (LMSR) yields dense softmax routing; the quadratic
market yields sparsemax routing with exact zeros, i.e. fewer active modules.
We verify the equivalence and both loss/regret bounds numerically, then show
in a piecewise-stationary simulation that market forgetting drives
switching-regret down ~5x, and that the quadratic market keeps sparse,
low-regret routing at liquidity values where LMSR becomes diffuse and
loses accuracy. This is a small-scale simulation; it motivates, but does not
establish, behaviour on trained mixture-of-experts models.

## 1. Setup

Let `R` be a convex regulariser on the simplex `Delta_n` and `b > 0`.
Define `C(q) = max_{p in Delta_n} <p,q> - b R(p)`. Then `C` is convex,
`grad C(q) = argmax_p(...) =: p(q)`, and a trader moving holdings from `q`
to `q+d` pays `C(q+d) - C(q) >= <p(q), d>`.

* `R = sum p_i ln p_i` gives LMSR: `p(q) = softmax(q/b)`.
* `R = 1/2 ||p||^2` gives `p(q) = Proj_simplex(q/b)`, sparsemax.

## 2. Results

**Prop. 1 (market = FTRL).** If a router plays `p_t = p(q_{t-1})` and then
sets `q_t = q_{t-1} + g_t` (gains), it is FTRL with regulariser `bR`.
*Proof.* `p(q) = argmax <p,q> - bR(p)` is the FTRL update on cumulative
gains. For `R` = negentropy this is exactly Hedge with `eta = 1/b`
(test: `test_lmsr_price_is_hedge_weights`).

**Prop. 2 (loss bound).** If outcome `i` occurs the maker pays `q_i` and has
collected `C(q) - C(0)`. By Fenchel duality `C(q) >= q_i - bR(e_i)` and
`C(0) = -b min R`, so loss `<= b (R(e_i) - min R) <= b (max R - min R)`:
`b ln n` for LMSR, `b(1-1/n)/2` for the quadratic market
(test: `test_worst_case_loss_bound`).

**Prop. 3 (regret).** For gains in `[0,1]^n`, standard FTRL analysis gives
`Regret <= b(max R - min R) + sum_t ||g_t||_*^2 / (2 sigma b)` for `R`
`sigma`-strongly convex w.r.t. `||.||`. Hedge: `b ln n + T/(8b)`. L2 market:
`b(1-1/n)/2 + Tn/(2b)` (loose). Both bounds hold in tests over random gains.

**Obs. 4 (sparsity).** `p_i(q) = 0` iff `q_i/b <= tau(q)`, the simplex
projection threshold; softmax prices are strictly positive.
Sparse prices matter for modular/decentralised systems: only modules with
`p_i > 0` need to run, be paid, or be checked.

## 3. Continual-learning simulation

Static markets have no mechanism to un-learn: after the best expert changes,
`q` for the old leader must be overtaken, which takes time proportional to
its accumulated lead. Multiplying holdings by `lambda < 1` each round
(forgetting) bounds `q` and gives an effective memory of `1/(1-lambda)`.

Setup: 16 experts, `T=3000`, Bernoulli gains (0.65 best / 0.5 others), best
expert changes every 500 rounds, 6 seeds, `lambda = 0.99`.
Switching regret ~373 without forgetting, ~74 with it (both markets,
tuned small `b`). For larger `b` (table in README) LMSR degrades to 228
(b=4) while the quadratic market stays at 86.5 with 1.4 active experts
(LMSR: 15.9).

*Conjecture (untested).* With bounded `q`, softmax scores stay within a
range `O(G/(1-lambda))/b`; once this range is `O(1)` the softmax is
near-uniform, whereas sparsemax still zeroes low-scoring modules. A
switching-regret bound for decayed FTRL would make this precise.

## 4. Relevance to verifiable decentralised inference

The routing weights are a deterministic function of the public trade log,
so any party can recompute `p_t` in `O(n)` per round and check that a
router followed the market. Sparse weights reduce the set of modules that
must also be verified for a given input. We make no security claim: a
strategic trader/router is out of scope (see the companion project
`../decentralized-verification-markets` for adversarial analysis of
peer-prediction verification).

## 5. Limitations and open problems

1. One synthetic environment; needs real MoE gating traces.
2. Prove switching regret for decayed markets; compare with fixed-share.
3. Learned `b` and `lambda` (e.g. meta-learning / restarts).
4. Extension to non-simplex potentials (Tsallis, `alpha`-entmax) that
   interpolate between the two markets.

## References

Hanson (2003); Chen & Vaughan (2010); Frongillo, Della Penna & Reid (2012);
Abernethy, Chen & Vaughan (2013), "Efficient Market Making via Convex
Optimization"; Martins & Astudillo (2016), "From Softmax to Sparsemax";
Duchi et al. (2008), "Efficient Projections onto the l1-Ball"; Herbster &
Warmuth (1998), "Tracking the Best Expert"; Gensyn, "Prediction Markets are
Learning Algorithms".
