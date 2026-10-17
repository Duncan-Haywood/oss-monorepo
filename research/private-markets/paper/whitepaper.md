# The subsidy cost of privacy in cost-function prediction markets

Duncan Haywood · MIT · code: `../src`, results: `../experiments/results.txt`

## Motivation
Waggoner, Frongillo and Abernethy ("A market framework for eliciting private data", NeurIPS 2015) show that a
cost-function market can release prices under differential privacy (DP) by perturbing the market state with a
continual-counting mechanism. In decentralised ML settings (Gensyn-style networks where contributors trade on
model quality or verification outcomes) traders' positions can leak proprietary information, so the same
question arises: what does privacy cost the market maker? This note implements the binary-LMSR case and measures it.

## Setup
Binary LMSR, C(q)=b·log(1+e^{q/b}). Trader t buys x_t∈[-1,1] yes-shares at cost C(q̃+x_t)−C(q̃), where q̃ is the
*publicly released* state. q̃_t is the binary-tree mechanism's noisy prefix sum of trades: each trade touches
L=⌊log₂T⌋+1 tree nodes, each node gets Laplace(LΔ/ε) noise with Δ=2 (replace one trade), giving ε-DP for the
entire released sequence with respect to replacing one trader's trade. Tests check the ≤L-nodes property and
exactness at ε=∞.

**Proposition (path-wise loss bound; proof sketch).** With e_t=q̃_t−q_t, the market maker's loss satisfies
loss ≤ b ln2 + Σ_t |x_t||e_{t−1}|/(4b). Reason: the same trades against the true state would cost the ordinary LMSR
loss ≤ b ln2 (path-wise, telescoping), and each step's payment differs from its true-state counterpart by
∫₀^{x}(σ((q̃+u)/b)−σ((q+u)/b))du ≤ |x||e|/(4b) since σ′≤1/4. The bound is checked on 600 simulated paths.

Simulation: T=256 traders, each with belief ℓ*+N(0,1) about the true log-odds, trading myopically toward it
(capped at one share); 200 markets per cell.

## Results (`experiments/results.txt`)
1. **Error is noise/b.** Final |logit error| falls almost exactly as 1/b and 1/ε: at b=10, 5.0 (ε=0.5), 3.0
   (ε=1), 1.8 (ε=2), 0.8 (ε=5), vs 0.19 without privacy.
2. **The tree mechanism is essential.** At b=10, ε=1: tree error 3.0, independent per-release noise (scale TΔ/ε) 48.7.
3. **Privacy is paid for in subsidy, not only in accuracy.** Noise in the public state is exploitable: traders
   trade against a mispriced quote. Observed mean market-maker loss at b=10 is 0.7 (ε=∞) but 18.7 (ε=5), 53.7 (ε=2)
   and 83.6 (ε=1), far above b ln2=6.9. The bound above is valid but loose (2–5× the observed mean).
4. **Design frontier.** To reach final logit error ≤0.5 needs b=2 without privacy, b=20 at ε=5, b=50 at ε=2,
   b=80 at ε=1, and b>80 at ε=0.5; see results for the corresponding observed losses. Larger b lowers noise
   impact but raises the b ln2 base subsidy, so total budget is minimised at an interior b for given ε.

## Limitations and further work
Stylised myopic traders who are not privacy-aware and do not exploit the noise strategically (a strategic trader
would only lose more); a single binary market; DP is w.r.t. trade replacement with the cap of 1 share, and
composition across markets is not modelled. Not a reproduction of the 2015 paper's guarantees, which are stated for
general cost functions; the loss bound here is the elementary binary-LMSR special case. Natural extensions:
the noisy-state-aware traders' best response, variance-reduced counters (matrix mechanism), clipping the released
price, and combining with the routing markets (`../../market-routing`) so that expert-selection signals are private.
