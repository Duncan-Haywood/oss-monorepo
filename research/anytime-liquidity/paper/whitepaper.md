# Anytime liquidity: what an unknown horizon costs a cost-function market maker

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
An LMSR with liquidity `b` routes over `N` experts exactly as Hedge with rate `1/b` (see `market-routing`), and its worst-case subsidy is `b ln N`. The tuned value `b = √(T/(8 ln N))` needs the horizon `T`. We study three ways to run without it. (i) A `√t` liquidity schedule `b_t = c√t` gives the bound `b_T ln N + Σ 1/(8b_t)`; the minimising `c* = 1/(2√ln N)` costs a factor tending to exactly `√2` over the horizon-aware bound `√(T ln N/2)` (1.364 at `T=100`, 1.413 at `T=10^5`, `N=10`). (ii) The doubling trick costs up to `√2/(√2−1) = 3.41×` in the bound; against a price-reactive adversary it measured 1.70× the continuous schedule's regret. (iii) Self-tuning liquidity `b_t = Δ_{t−1}/ln N` (AdaHedge; `Δ` = cumulative mixability gap) makes the subsidy equal the data's difficulty: on i.i.d. losses with gap 0.6 it stayed at 1.27 against 101.97 for the `√t` schedule, with regret at most `2Δ_T` in every run. All checks are numeric; the bounds are the standard FTRL ones and are stated as such.

## 1. Setup
Prices at round `t` are `w_i ∝ exp(−L_i(t−1)/b_t)`, losses in `[0,1]`, `η_t = 1/b_t`. For a nondecreasing schedule the standard bound is `R_T ≤ b_T ln N + Σ_t 1/(8 b_t)`. Read as a market, `b_T ln N` is the subsidy the maker must have ready; note the subsidy is *not known in advance* under an adaptive `b_t`, which is the point of the last section.

## 2. The `√t` schedule and the price of ignorance
With `b_t = c√t`, `Σ 1/(8c√t) ≤ √T/(4c)` and `b_T ln N = c√T ln N`, minimised at `c* = 1/(2√ln N)` with value `√(T ln N)`, against `√(T ln N/2)` for the tuned fixed `b`. So not knowing `T` costs `√2` in the guarantee, and the exact-sum ratio approaches it from below (E1: 1.364, 1.398, 1.409, 1.413 for `T = 10²…10⁵`). Realised regret against a best-response adversary (always loses on the heaviest half of experts) was 22.8 (fixed `b`, bound 45.6) vs 31.1 (`√t`, bound 64.0): the *realised* ratio is 1.37, not 1.41, and both run at 0.49–0.50 of their bounds, so the analysis is within about 2× of this adversary.

## 3. Doubling
Restarting a horizon-aware market at `t = 2^k` costs `Σ_k √(2^k) ≤ 3.41 √T`-shaped constants in the bound. On the same adversary the doubling regret was 1.70× the continuous schedule at `T = 10^3, 4·10^3, 1.6·10^4` (E3): dominated by the continuous schedule in bound and in measurement, and it also resets prices to uniform at each epoch, which a market with open positions cannot do without paying the maker.

## 4. Self-tuning liquidity
Set `b_t = Δ_{t−1}/ln N` where `Δ_t = Σ_s (h_s − m_s)` sums each round's gap between the Hedge loss and the mix loss. Then `R_T ≤ 2Δ_T` (held in every run; tested), and the subsidy implied at time `T` is `b_T ln N = Δ_{T−1}`: the maker's subsidy is the accumulated gap. E4 (`N=8, T=20000`, i.i.d. losses, gap between the best and the others):

| gap | `√t` regret | `√t` subsidy | adaptive regret | adaptive subsidy |
|---|---|---|---|---|
| 0.00 | 102.2 | 102.0 | 96.0 | 64.1 |
| 0.05 | 24.7 | 102.0 | 18.2 | 11.8 |
| 0.20 | 6.7 | 102.0 | 5.1 | 3.4 |
| 0.60 | 2.3 | 102.0 | 1.8 | 1.3 |

Against a reactive adversary (`T=5000`) the adaptive market's regret was 50.6 (`√(T ln N/2)` = 72.1), with subsidy 51.0. The cost is that the subsidy is only known ex post; a maker who must post a cap up front can truncate `b_t ≤ b_max`, which we did not analyse.

## 5. Limitations
(1) Regret bounds, not payoff bounds of a market with traders: we do not model that raising `b` mid-stream lowers the cost function on existing holdings, so path-dependent arbitrage against a `b_t` schedule is not analysed. (2) One adversary family and i.i.d. data; `N ≤ 10`. (3) Losses in `[0,1]`; no second-order or small-loss refinements. (4) Restarts in the doubling measurement sum per-epoch regrets, an upper bound. (5) Not a claim about any deployed system. Contributions: the exact `√2` price of an unknown horizon for LMSR routers with the optimal constant `c*`, a measured doubling penalty, and the identification of adaptive liquidity with a data-driven subsidy.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (10 tests) and `PYTHONPATH=src python3 experiments/run.py` (deterministic; seconds).
