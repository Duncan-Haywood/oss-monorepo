# Decision markets for model routing: what exploration costs the payer, and what a stake does to the answer

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A decentralised network that must pick one of K models or checkpoints can ask a market per arm to forecast that arm's loss *conditional on being chosen*, then route by the prices. Only the chosen arm's loss is ever observed, so the market on an arm that is not chosen never pays out. We study a stylised Gaussian version with a softmax router. (i) An inverse-propensity Brier payment `1[chosen]·k(r−θ)²/π` is exactly proper even when the routing probability `π` reads the trader's own report, because `π` cancels; the same score without the `1/π` weight is not proper (a trader who wants to be chosen shades its loss forecast; a trader paid only a penalty reports an arbitrarily bad loss to hide). (ii) The price of the weight is exact: `E[1/π_a] = 1+(K−1)e^{ω²/2τ²}`, where `ω` is the standard deviation of the gap between two honest reports and `τ` the router temperature, so a payment's relative standard deviation is `√(3E[1/π]−1)` and the smallest temperature a payment cap allows is closed form. A probit router has *infinite* payment variance for `τ ≤ ω`. (iii) Exploration regret against greedy routing is at most `0.2785τ` per decision. (iv) If traders also earn a stake `B_a` when their arm is chosen, equal stakes cancel exactly in the decision, and a stake gap `ΔB` shifts the reported gap `D` to the fixed point `D_r = D + ΔB·σ′(D_r/τ)/(2kτ)`. Its first-order effect on expected loss vanishes by symmetry, so the harm scales as `(ΔB/k)²`. Everything is Gaussian, one-shot and stylised.

## 1. Model
K arms with independent losses `θ_a ~ N(0,s²)`. The arm's trader sees `x_a = θ_a + N(0,σ²)` and, if truthful, reports the posterior mean `m_a = λx_a`, `λ = s²/(s²+σ²)`, with posterior variance `v = λσ²`. For two arms the gap `D = m_1−m_0` is `N(0,ω²)`, `ω² = 2λs²`. The router picks arm 0 with probability `π_0 = σ(D/τ)` (logistic; softmax for K arms). Only the chosen arm's `θ` is revealed. The design problem is the one in the decision-market literature (Othman & Sandholm; Chen & Kash on eliciting predictions for decisions): the report determines the decision, and the outcome is seen only under that decision.

## 2. Inverse-propensity scoring is proper when the policy reads the report
Pay the trader of arm `a` `1[a chosen]·(c − k(r_a−θ_a)²/π_a(r))`. If the policy depends on the report, the expected payment is still `π(r)·(1/π(r))·(c − k((r−m)²+v)) = c − k((r−m)²+v)`, maximised at `r = m` for *any* positive policy (E2, exact to 12 digits for a policy that moves with the report). Drop the weight and the payoff is `π(r)(A − k((r−m)²+v))`. In E2 (`A=1.2`, `kv=1`) the trader shades its forecast to `+0.151` against a truthful `+0.200`, to be chosen more often; with `A=0` (a pure penalty) the optimum runs off to the edge of the search range, since a report bad enough to make `π→0` escapes the penalty altogether. A deterministic argmin router is the limit `τ→0` of this: `1/π` is infinite on the arm not chosen, which is why hard decision markets have to randomise.

## 3. What exploration costs the payer
Honest payments have `E[k S/π·1[chosen]] = kv` (`S=(m−θ)²`, `E S = v`) and second moment `3k²v²E[1/π_a]`, since `E[S²] = 3v²`. For a softmax over K arms with iid honest reports,
`E[1/π_a] = 1 + (K−1)e^{ω²/(2τ²)}`,
by the Gaussian moment generating function of the report gap. The payment's relative standard deviation is `√(3E[1/π]−1)`, so a cap `C` on it fixes the smallest usable temperature, `τ_min = ω/√(2 ln((e−1)/(K−1)))` with `e=(C²+1)/3` (`temperature_for_rel_std`); it does not exist when `C² ≤ 3K−1`, the value under uniform routing. E1 (`s=σ=1`, `ω=1`): `E[1/π] = 2.13, 2.65, 8.39, 259.7` at `τ = 2, 1, 0.5, 0.3`. Monte Carlo matches the mean to 1.6% everywhere and the second moment to 1.6% and 2.2% at `τ=2,1` (400k rounds); at `τ=0.5` it is 17% low and at `τ=0.3` it sees 28.9 against the exact 194.8, because the second moment is carried by rare rounds. A payer sizing a bounty from a simulated variance at low temperature will under-reserve. More arms cost more: at a relative-std cap of 10, `τ_min = 0.379, 0.458, 0.570, 0.802` for `K = 2, 4, 8, 16` (E5).

*Probit routers.* With `π = Φ(D/τ)`, `1/π ~ √(2π)(|D|/τ)e^{D²/2τ²}` in the tail, which is integrable against the Gaussian density iff `τ > ω`. E4 truncates at `L` standard deviations: at `τ=0.7` the truncated `E[1/π]` grows from 158 (`L=3`) to `2.8×10¹⁸` (`L=9`); at `τ=1` (the borderline) it grows steadily (6.6 → 43.6); at `τ=1.5` it settles at 2.969. The logistic router never diverges, so it is the safe default.

*Regret.* Choosing the worse arm costs `|D|`, so regret against greedy is `E[|D|σ(−|D|/τ)] ≤ 0.2785τ` for any gap law. E3: regret `0.0016, 0.0063, 0.0232, 0.0713, 0.160` at `τ = 0.05 … 0.8` against greedy's loss `−0.399`; at `τ=0.4` the router keeps 82% of greedy's gain and its payments have relative std 8.4.

## 4. Stakes
Suppose the trader on arm `a` also gains `B_a` when its arm is chosen (it owns the model). With the proper score its objective is `B σ((r_o−r)/τ) − k(r−m)²`. First-order condition: it under-reports its loss by `b = Bσ′(D_r/τ)/(2kτ)`. The problem is strictly concave for every opponent report iff `B ≤ 12√3·kτ²`, because `max|σ″| = 1/(6√3)`; above it best responses jump (E6: the best report moves 0.17 per 0.02 step of the opponent's report at `0.9×` the limit, 3.68 at `1.6×`).

*Equal stakes cancel.* Both traders shade by the same `b`, the reported gap is unchanged, and the decision is untouched (E6: shift 0.0000 for `D = 0…2.5` with `b = 0.200, 0.196, 0.157, 0.056`); the cost is paid in distorted prices, not routing. *A stake gap does not.* The equilibrium gap solves `D_r = D + ΔB σ′(D_r/τ)/(2kτ)`, unique below the concavity limit; simultaneous best-response iteration agrees with the fixed point to 8 digits (`+0.1981, +0.1885, +0.1464, +0.0536` at `D = 0, 0.3, 1, 2.5` for stakes 12 vs 4, `k=5, τ=1`).

*The harm is second order.* The shift `δ(D) = ΔBσ′(D_r/τ)/(2kτ)` is even in `D`, while the marginal effect of favouring arm 0 on expected loss is odd (it hurts when arm 0 is worse and helps when it is better), so the first-order loss cancels. E7 (`k=8`, `τ=0.454`): extra loss `1.0×10⁻⁴, 4.0×10⁻⁴, 1.6×10⁻³, 6.4×10⁻³` at `ΔB = 1, 2, 4, 8`, ratios `1, 4.00, 15.95, 63.1`. Doubling the scoring scale `k` divides it by four (`0.0513 → 0.0141 → 0.0036 → 0.0009` for `k = 2…16` at `ΔB = 6`, cap 6). A stake gap tilts routing probabilities, yet costs little expected loss until `ΔB/k` is large. This is an average statement: an owner can still bias a particular round, and a router that acts on one draw is exposed to it.

## 5. Design rule
Given a payment cap `C`, take `τ = τ_min(C, K, ω)`; choose `k` so that the largest plausible stake gap is below `12√3·kτ²` (uniqueness) and the extra loss `≈ c(ΔB/k)²` is acceptable. `k` scales payments linearly and leaves their relative std unchanged, so the trade is payer outlay `kv` per round against distortion `∝ k⁻²`.

## 6. Limitations
(1) Gaussian priors, one round, independent arms, a single informed trader per arm; the closed forms use Gaussian mgfs. (2) The traders are paid by a proper score, not through a market maker; the LMSR version pays the same expected amounts but adds inventory dynamics (see `market-routing`). (3) Stakes are a fixed benefit per selection; stakes correlated with the outcome, or trader collusion across arms, are not analysed. (4) The fixed-point distortion is derived for the logistic router and simultaneous moves; sequential trading can differ. (5) No learning across rounds: exploration here is priced but not compared with bandit alternatives such as Thompson sampling. (6) No claim that the router's `τ` can be enforced on-chain; that needs a verifiable random beacon (see `fiat-shamir-grinding`).

## Reproduce
```bash
cd research/decision-markets
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 experiments/run.py   # ~5 s, writes experiments/results.txt
```
