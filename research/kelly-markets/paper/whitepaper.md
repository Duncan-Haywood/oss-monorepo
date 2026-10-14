# Kelly markets as expert routers: risk tolerance is the learning rate

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Wealth-based markets (Kelly bettors, self-financed wagering) are a natural way to route among modular experts without a central trainer, and their state is a deterministic function of public data, so it can be replayed and verified. We analyse the binary case in which agent `i` bets a fraction `λ_i` of its wealth. (i) Clearing gives the price `p = Σλ_i w_i q_i / Σλ_i w_i`, total wealth is conserved, and at `λ=1` the market is exactly the Bayes mixture (verified to 1e-8). (ii) For any outcome sequence, including adversarial ones, market log-loss exceeds expert `i`'s by at most `ln(1/s_i)/λ_i`; on i.i.d. data the measured regret is 8–100% of that bound. (iii) A price-taker's growth-optimal fraction is `λ* = (π−p)/(q−p)` (bet exactly enough to make the shaded belief equal the truth). (iv) Moving the price from `p₀` to `p` against calibrated others of weight `V` costs `V·χ²(p₀‖p)` in expectation, independent of the manipulator's belief: it matches an LMSR (`b·KL`) with `b=2V` for small shifts and is 2.6× stiffer at `p=0.95`, 7.5× at `0.99`. (v) On a truth that switches between two regimes, full Kelly is wrong about half of every segment (regret ≈1630 at T=4000 for every period `P≤600`), while a fractional `λ` of 0.05–0.2 cuts regret 3–7×, and the best `λ` falls as the period grows. Exact identities, tests and seeded simulation; stylised model.

## 1. Model
Binary `y`; agent `i` has wealth `w_i`, belief `q_i = P(y=1)` and fraction `λ_i ∈ (0,1]`. It holds the portfolio `λ_i` Kelly + `(1−λ_i)` in the risk-free (both-securities) bundle, so its demand is `w_i q̃_i(y)/p(y)` shares with shaded belief `q̃_i = λ_i q_i + (1−λ_i)p`. Setting total shares at each outcome equal to total wealth `W` gives `p = Σ_i λ_i w_i q_i / Σ_i λ_i w_i` (tested: clearing residual < 1e-10 for random populations). Wealth updates as `w_i' = w_i(1 − λ_i + λ_i q_i(y)/p(y))`. Summing and substituting `p` gives `Σ w_i' = Σ w_i` exactly (tested), for heterogeneous `λ`. So `λ_i w_i` is voting weight, and `λ` acts as a per-agent learning rate.

## 2. Full Kelly is Bayes
At `λ=1`, `Π_t p_t(y_t) = Σ_i (w_i/W) Π_t q_i(y_t)`: the market predictive is the Bayes mixture with prior `w_i/W`. The test compares the simulated cumulative loss to `−ln Σ ...` on random 7-expert populations and agrees to 8 decimals. Consequently regret against the best expert is at most `ln(1/s_i)`, the same as Hedge with rate 1.

## 3. Regret with fractional Kelly
Let `s_i = w_i/W` (share). By the update, `Σ_t ln(1−λ_i+λ_i r_t) = ln(s_i(T)/s_i(0)) ≤ ln(1/s_i(0))` where `r_t = q_i(y_t)/p_t(y_t)` and `s_i(T) ≤ 1`. Concavity gives `ln(1−λ+λr) ≥ λ ln r`, hence
`L_market − L_i ≤ ln(1/s_i(0)) / λ_i`.
This holds for every sequence and for heterogeneous `λ` (each expert's regret is governed by its own `λ_i`); the tests check 300 random instances and an adaptive adversary that always plays the outcome the market rated less likely. It is loose on benign data. E1 (`N=10`, `T=2000`, `y~Bern(0.7)`, 20 seeds): mean regret 2.30, 2.08, 3.64, 5.10, 5.95, 9.04 for `λ = 1, 0.5, 0.2, 0.1, 0.05, 0.02` against bounds `2.3, 4.6, 11.5, 23, 46, 115`. Regret grows with `1/λ` but far slower than the bound, and `λ=0.5` beats full Kelly on average at this horizon (a small sample-to-sample effect; we do not claim a general rule). A wealth floor also follows: an expert loses at most a factor `1−λ` per round, whereas at `λ=1` a zero-probability report wipes it out.

## 4. Growth-optimal fraction
For a price-taker with belief `q` at price `p` and true `P(y=1)=π`, expected log-growth is `π ln(1−λ+λq/p) + (1−π) ln(1−λ+λ(1−q)/(1−p))`. Setting the derivative to zero gives `λ* = (π−p)/(q−p)`, clipped to `[0,1]`; equivalently `λ*q + (1−λ*)p = π`. In E4 (`p=0.7, q=0.95, π=0.8`) `λ*=0.4`; growth per round is `+0.0257` at `λ*`, `+0.0107` at 0.1, `−0.0187` at 0.8 and `−0.114` at full Kelly; a 200,000-round Monte Carlo agrees to within 0.001 (grid search over `λ` recovers `λ*` in tests). An overconfident agent therefore self-destructs at `λ=1` and, once `λ` is beyond about `0.72` here, has negative growth. The price is sensitive to `λ` too, so an agent's optimal declared risk tolerance is a function of its calibration, which a verifier can estimate from public outcomes.

## 5. Manipulation cost
Let the others have `V = Σ_{j≠m} λ_j w_j` and a rest-price `p₀` equal to the truth. A manipulator with belief `q` and weight `Λ = λ_m w_m` moves the price to `p = (Vp₀+Λq)/(V+Λ)`, i.e. needs `Λ = V(p−p₀)/(q−p)`. Its expected wealth change is `−Λ(q−p)(p−p₀)/(p(1−p)) = −V(p−p₀)²/(p(1−p))`, so
`cost(p₀→p) = V · χ²(p₀‖p)`,
independent of `q` (tested against the exact expectation and against the others' gain, which is equal by conservation). Compare the LMSR result `b·KL(p₀‖p)` (see `market-manipulation`). Since `KL ≈ χ²/2` for close distributions the two match when `b = 2V` (E2: ratio 1.01 at `p=0.55`, 1.09 at 0.7). Away from `p₀` the Kelly market is stiffer, because `χ²` blows up as `1/(1−p)`: ratio 1.26, 1.74, 2.57, 7.51 at `p = 0.8, 0.9, 0.95, 0.99`. The needed weight is also unbounded (`Λ = 49V` for `p=0.99`), so price extremes are protected by wealth, not by a bounded-loss subsidy: the sponsor pays nothing, at the price of depth that depends on the population's wealth and `λ`.

## 6. Switching truth
E3 alternates the truth between `π=0.8` and `0.2` every `P` rounds with two experts `q=0.8, 0.2`; regret is against an oracle that picks the right expert each segment (`T=4000`, 20 seeds).

| P | λ=1 | 0.5 | 0.3 | 0.2 | 0.1 | 0.05 | 0.02 | 0.01 | best λ |
|---|---|---|---|---|---|---|---|---|---|
| 25 | 1631 | 933 | 793 | 772 | 781 | 783 | 777 | 773 | 0.2 |
| 100 | 1645 | 816 | 586 | 522 | 563 | 672 | 758 | 776 | 0.2 |
| 250 | 1635 | 753 | 491 | 387 | 357 | 449 | 632 | 719 | 0.1 |
| 600 | 1501 | 736 | 457 | 333 | 245 | 273 | 433 | 592 | 0.1 |

Full Kelly forgets as slowly as it learns: after a switch it needs about as many rounds to unlearn as it took to learn, so it is wrong about half of each segment whatever `P`. Fractional Kelly bounds the loser's decay at `1−λ` per round and trades slower learning for faster recovery; the best `λ` is interior and falls with `P` (0.2 → 0.1 over these periods). Wealth ratios of about `e^-745` underflow in double precision, so a production implementation should work with log-shares.

## 7. Implications for verifiable routing
The whole market is `(w, λ, q)` plus the public outcome stream, so a verifier can replay it, and the price certificate is a weighted average. The `1/λ` bound says how long a modular system needs to identify a good expert; the switching table says the price of committing too hard. `λ` should be chosen to match the drift of the environment, not left at the growth-optimal value for a stationary world.

## 8. Limitations
(1) Binary events only and static experts (each `q_i` fixed); no learning inside experts and no information aggregation beyond weighting. (2) Agents are price-takers; no strategic bidding of `λ`, and the manipulation analysis assumes the rest of the market is calibrated and a one-shot shift. (3) Regret bound is loose on benign data and we give no matching lower bound. (4) The best-`λ` trend in E3 is empirical with one regime pair. (5) Wealth is assumed not to be replenished and there is no entry or exit, and no fixed-share tax (see `wagering-modular-experts`). Contributions: heterogeneous-`λ` clearing and conservation, the `ln(1/s)/λ` bound, `λ*=(π−p)/(q−p)`, the `V·χ²` manipulation law and its LMSR comparison, and the switching trade-off.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (11 tests) and `PYTHONPATH=src python3 experiments/run.py` (deterministic; seconds).
