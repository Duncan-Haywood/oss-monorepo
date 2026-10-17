# Calibration hedging: why a calibration test cannot certify a verifier

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Decentralised-training protocols that slash verifiers for miscalibration (`sequential-slashing`, `conformal-tolerance`, `forecast-duel`) implicitly treat calibration as evidence of competence. It is not. A hedger who knows nothing about the outcomes can be calibrated against every sequence (Foster and Vohra 1998; Foster 1999). I give a constructive two-point minimax hedger and a crude but explicit bound: `E[ECE] ≤ √(K+1)(1/(2K)+1/√T)` for a `K+1`-point forecast grid. In simulation (K=10, T=2000) it has ECE 0.016 against an adaptive adversary yet Brier 0.254 (coin flip: 0.250), against 0 for a verifier who knows the adversary's rule; a lazy constant forecaster is caught (ECE 0.5) and the hedger passes every calibration threshold tried (ε ∈ {0.05, 0.1, 0.2}). A Brier-gap test against an informed benchmark detects the hedger in 100/100 runs at T=500. Calibration tests are gameable; only resolution-sensitive scoring separates informed from uninformed verifiers.

## 1. Model
Rounds `t=1..T`: a verifier announces `p_t ∈ {0,1/K,…,1}`, then a binary outcome `y_t` appears. Let `S_i = Σ_{t: p_t=i/K}(y_t − i/K)` and `ECE = Σ_i |S_i|/T`, the usual `Σ (n_i/T)|ȳ_i − p_i|`. The adversary (nature, or a colluding task generator) may see the hedger's *distribution* over `p_t` each round but not the realised draw.

## 2. The hedger and its guarantee
With potential `Φ = Σ S_i²`, playing `q` changes `Φ` in expectation by `2Σ q_i S_i(y−p_i) + E(y−p)² ≤ 2v_t + 1`, where `v_t` is the value of the `2×(K+1)` game with payoff `S_i(y−p_i)` (`game_value`). The hedger plays the minimax `q`, which has support ≤ 2 (`mix`). Any mixed nature strategy `π` is answered by the grid point nearest `π`, paying at most `|S_i|/(2K)`, so `v_t ≤ max|S_i|/(2K)`. Solving `u_{t+1}² ≤ (u_t+1/(2K))² + 1` for `u_t=√E Φ_t` gives `u_T ≤ T/(2K)+√T` and, by Cauchy–Schwarz over `K+1` bins, the bound above. It is a worst case: measured ECE is 5–20× lower (E1: K=10, T=4000: 0.010 adaptive, 0.040 iid, bound 0.218). Tests check that the mixture is a distribution, beats every pure forecast, satisfies the `max|S|/(2K)` value bound in the hard sign pattern `S_0 ≥ 0 ≥ S_K`, and that `E Φ` and ECE respect the bounds over 40–60 runs.

## 3. Calibrated and ignorant
Against the adversary "`y=1` iff the mean forecast is below ½" the outcomes are a deterministic function of the hedger's own state, so an informed verifier scores Brier 0, while the hedger scores 0.254 (E2). Against i.i.d. Bernoulli(0.7) the hedger is forced towards the base rate (Brier 0.2187 vs the 0.2100 optimum) — calibration there costs it little because there is nothing to hedge against. So the point is not that the hedger is always bad; it is that the *calibration certificate is identical* for an informed and an ignorant verifier. E3: the hedger passes `ECE ≤ ε` in 100% of runs for ε=0.05, 0.1, 0.2 at T=2000, while a constant-½ forecaster fails all three.

## 4. Cost of certainty
The bound only certifies ECE ≤ ε once `T ≥ (K+1)/(ε−√(K+1)/(2K))²` (`min_rounds`), and requires `ε > √(K+1)/(2K)`: for K=50 that is T ≥ 3085, 8259, 62413 for ε = 0.2, 0.15, 0.1. A finer grid tests calibration more finely but needs more rounds to have any power against it.

## 5. Implications for protocol design
(i) Do not slash or reward on calibration alone. (ii) Pay on a proper score *relative to a benchmark* (`forecast-duel`, `score-recalibration`): the Brier gap to an informed benchmark at T=500 is 0.26 in every run (min 0.261). (iii) If the task stream is chosen by a party who can see verifier state, calibration is trivially satisfiable; randomise task selection with a beacon (`committee-sampling`, `fiat-shamir-grinding`). (iv) Calibration remains a necessary sanity check for honest verifiers (`score-recalibration`).

## 6. Limits
Binary outcomes, a fixed grid, an adversary blind to the realised draw. The bound is loose by design; tight rates and the deterministic-forecast lower bounds of Oakes (1985) and Foster–Vohra are not reproduced. The informed verifier is assumed to know the rule (Brier 0) or the true parameter (0.21). Related: Foster and Vohra 1998, Foster 1999, Hart (Blackwell approachability), Frongillo and coauthors on proper scoring and elicitation, and Gensyn's verification programme. Synthetic; the numbers are simulations averaged over 20–100 seeds (E1/E2 use 20).
