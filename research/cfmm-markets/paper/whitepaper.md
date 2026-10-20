# CFMM markets: what a constant-product pool concedes to informed traders, and how it routes experts

## Question
Frongillo, Papireddygari and Waggoner show that constant-function market makers (Uniswap-style AMMs) are cost-function prediction markets in disguise. Decentralised verification and routing protocols will be built on such pools. What does the pool concede to a trader who knows more, how expensive is it to push it to extreme prices, and is it a good online router of experts compared with LMSR / Hedge?

## Model
n outcomes; the pool keeps reserves r_i with ∏ r_i = C0ⁿ. A trader who has net-bought q_i shares of outcome i has put C(q) − C0 of collateral in (collateral mints one token of every outcome, so r_i = C − q_i), hence C is defined by ∏(C − q_i) = C0ⁿ. Differentiating gives the price vector p_i = (1/r_i)/Σ_j(1/r_j) on the simplex. To compare with LMSR we match worst-case maker loss: LMSR liquidity b = C0/ln n.

## Results
1. **Worst-case loss is C0 and is never attained.** sup_q [q_o − (C(q) − C0)] = C0 (e.g. loss 9.999 of 10 at 10⁴ shares); C is convex, 1-homogeneous in (q, C0) and shifts by t under q ↦ q + t·1.
2. **Informed profit in closed form.** A trader with belief π who moves prices to π pays C0((∏π)^{1/n}/min π − 1) and earns exactly C0(1 − n·GM(π)), GM the geometric mean. This is 0 at uniform π and → C0 at certainty. LMSR at equal worst-case loss concedes C0(1 − H(π)/ln n). Near uniform π the ratio of the two tends to ln n exactly, so the CFMM concedes less than LMSR for n = 2 (0.020 vs 0.029 of the loss at π = (.6,.4); 0.40 vs 0.53 at (.9,.1)) and more from n = 3 (0.349 vs 0.322 at (.7,.1,.1,.1)); the two coincide at n = e. Far from uniform the gap closes (0.8745 vs 0.8790 at (.97,.01,.01,.01)).
3. **Polynomial tails make extreme prices expensive.** Binary: moving the price to p costs C0(√(p/(1−p)) − 1) for C0(2p−1)/√(p(1−p)) shares, versus b ln(1/(2(1−p))) for LMSR. With C0 = 1: p = 0.9 costs 2.0 vs 2.3, p = 0.99 costs 8.95 vs 5.64, p = 0.999 costs 30.6 vs 8.97 (3.4×). A laggard's price at gap G behind a leader is ≈ (C0/G)ⁿ (measured 1.0×10⁻⁸ at n=4, G=1000, C0=10) versus e^{−G/b} for LMSR (6×10⁻⁶¹): the pool never forgets a trailing outcome exponentially fast.
4. **Exact regret identity for routing.** Feeding gains g_t into q and reading prices before each update, regret against expert i equals [Q_i − (C(q_T) − C(0))] + Σ_t D_t, where the first term is ≤ C0 and D_t ≥ 0 are the Bregman divergences of C. It holds to 10⁻¹³. Unlike LMSR, ∇²C is not uniformly bounded (reserves of a leader shrink), so no T/b-type bound follows; measured Σ D_t is 7.5 at C0 = 2 vs 0.3 at C0 = 50 (n=4, T=500, uniform gains).
5. **Negative result: no forgiveness advantage.** In a regime switch (expert 0 best at mean gain 0.7 for 1000 rounds, then expert 1; others 0.5; n = 4; 100 seeds) polynomial tails were expected to help recovery. They do not: pre-switch regret is 3.4/10.8/40.2 for C0 = 2/10/40 against 3.6/11.1/40.7 for LMSR at matched loss, and post-switch regret is 188.8/188.8/186.0 against 188.8/187.7/177.5, with recovery after ≈ 943 rounds for both. Recovery is set by the leader's accumulated lead divided by the new gain gap, not by the shape of the tail.

All closed forms are checked against the implicit cost function and numerical optimisation in `tests/`; experiment output is in `experiments/results.txt`.

## Limitations
Symmetric pools only (constant-mean pools with weights would set a non-uniform prior); no trading fees or liquidity providers entering and leaving; myopic price-taking traders; the comparison fixes worst-case loss as the budget, which is one of several defensible normalisations (matching initial slippage instead gives a different ordering); routing experiments are stochastic-gain toys and the Bregman terms are measured, not bounded.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v`; `PYTHONPATH=src python3 experiments/run.py`.
