# When to stop checking: proper scores, optimal stopping and the accuracy a verifier delivers

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
`effort-elicitation` asks how much checking a proper score buys when the verifier commits to a sample size in advance. Real verifiers stop adaptively. I solve the sequential problem for a binary claim: each check is an independent signal of accuracy `a` costing `c`, the verifier stops when it likes, reports its posterior and is paid a proper score with truthful-payoff (entropy) function `G` and scale `κ`. Posterior log-odds walk on a lattice of step `λ = ln(a/(1−a))`, so the optimal policy is a symmetric threshold `|j| = k` (checked against dynamic programming over all policies) and everything is closed form: delivered accuracy `p_k = 1/(1+((1−a)/a)^k)`, expected checks `k(2p_k−1)/(2a−1)`, verifier utility `G(p_k) − c·k(2p_k−1)/(2a−1)`. Consequences: (i) the verifier participates iff `κ ≥ c/(G(a)−G(½))`, which is `4c/(2a−1)²` for Brier and about half that for log; (ii) under Brier the threshold grows as `k* ≈ ln(κ(2a−1)²/((1−a)c))/λ` (within one step, `κ` from 10 to 10⁹), and the log score pushes it 2–4 steps further at the same scale; (iii) a verifier who can stop adaptively delivers error 0.033 with 9.3 expected checks where a commit-to-`n` verifier at the same score delivers 0.126, and matching the sequential error with a fixed sample takes 19 checks; (iv) to buy delivered error ε the principal needs a score scale growing roughly like `1/ε` under either rule, with log's constant 2.7–7× smaller (`κ` 38.9 vs 5.4 at ε = 10⁻³).

## 1. Model
State θ∈{0,1} with prior ½. Check `i` returns a signal correct with probability `a>½`, independent given θ, at cost `c`. After stopping at time τ the verifier reports a probability `r` and is paid `S(r,θ)`, strictly proper; reporting truthfully at belief `p` earns `G(p)`, convex and symmetric. Utility is `E[G(p_τ)] − c E[τ]`. This is the sequential analogue of the static effort problem in `effort-elicitation`, with the same scores (`κ(1−(r−θ)²)` for Brier, `κ ln r_θ` for log, `G = −κH`).

## 2. The optimal rule is a threshold, in closed form
The posterior log-odds after `j` net correct checks is `jλ`, so `j` is a simple random walk with up-probability `a` in the true state. Value iteration over all stopping policies on `|j| ≤ 60` returns a continuation region `{−k+1,…,k−1}` and initial value equal to the threshold formula in all six (score, `a`, `c`) cases tested (`test_dp_matches_threshold`, agreement 10⁻⁹): by symmetry and convexity of `G` the optimum is symmetric. For the threshold `k`, gambler's ruin gives `P(hit +k) = 1/(1+r^k) = p_k` when the state is yes (`r=(1−a)/a`), so the stopped report is right with probability `p_k`, and Wald's identity gives `E[τ] = k(2p_k−1)/(2a−1)`. Both match simulation (E1: k=4, `a=0.7`: 0.9674 and 9.347 exact against 0.9679 and 9.385 over 40 000 runs) and an absorbing-chain enumeration to 10⁻⁹. Hence
`U(k) = G(p_k) − c k (2p_k−1)/(2a−1)`, maximised over integers `k ≥ 0`.

## 3. Participation and the score scale
One check costs exactly `c` (`E[τ]=1`), so the verifier checks at all iff `κ(G_1(a) − G_1(½)) ≥ c`, i.e. `κ ≥ c/(G_1(a)−G_1(½))` (E3, test). For Brier `G_1(a)−G_1(½) = (2a−1)²/4`, so the floor is `4c/(2a−1)²`; log needs `c/(ln 2 − H(a))`, which tends to half of Brier's as `a→½` (1.997 vs 4.000 at `a=0.55`) and is 2.0–2.3× smaller at `a=0.7, 0.9`. Scores of equal scale are not equal incentives: log has twice the curvature at ½. Multiplying `κ` and `c` together changes nothing (scale invariance, tested).

## 4. How much stopping the score buys
Table (`a=0.7`, `c=0.01`, E2):

| κ | Brier k* | Brier error | log k* | log error |
|---|---|---|---|---|
| 1 | 4 | 0.0326 | 6 | 0.0062 |
| 10 | 7 | 0.0027 | 9 | 0.0005 |
| 100 | 10 | 0.0002 | 12 | 0.00004 |

Each threshold step multiplies the error by `r = 3/7`, so accuracy is geometric in `k` while `k*` is only logarithmic in `κ/c`. For Brier the marginal gain of the last step is `≈ κ r^k (1/r−1)` against a marginal cost `c/(2a−1)`, giving `k* ≈ ln(κ(2a−1)²/((1−a)c))/λ`; at `a=0.7, c=10⁻³` the exact `k*` is 10, 12, 15, 18, 23, 31 for `κ=10¹,10²,10³,10⁴,10⁶,10⁹` against predictions 10.1, 12.9, 15.6, 18.3, 23.7, 31.9 (E5, tested within one step). The log score's marginal gain has an extra factor of `k` from `H(p_k) ≈ (kλ+1) r^k`, so it stops 2–4 steps later at every scale.

## 5. Sequential versus fixed sample
A verifier who must commit to `n` in advance maximises `E[G(p_n)] − cn` (exact binomial sum). At `κ=10`, Brier, it takes `n=28` and delivers error 0.0143; the sequential verifier delivers 0.0027 with 17.4 expected checks and higher utility (+9.80 vs +9.62). Matching the sequential error with a fixed sample needs `n=45`, 2.6× the checks; at `κ=1` it needs 19 vs 9.35 (2.0×), at `κ=100` 71 vs 25 (2.8×). For log at `κ=10` the fixed verifier's error is 0.0036 against 0.0005. Adaptive stopping is worth 2–3× in checks at equal accuracy in this range, and a principal who designs around a fixed-sample model will see the verifier deliver far better accuracy than modelled at lower cost — or, if it sets `κ` from the fixed model, overpay.

## 6. Pricing accuracy
Inverting E2 by bisection (`a=0.7, c=0.01`, E6), the smallest scale delivering error ≤ ε is, Brier / log: ε=0.1: 0.47 / 0.17; 0.03: 1.6 / 0.41; 0.01: 3.4 / 0.72; 10⁻³: 38.9 / 5.4. Because the expected payment is `≈κ` at high accuracy, log buys the same accuracy for a 2.7–7× smaller stake scale here, but its payment is unbounded below (`ln r`): `tangent-log` gives a bounded variant, and `effort-elicitation` treats the rent. Both scales grow roughly like `1/ε` (Brier 3.4 → 38.9, log 0.72 → 5.4 for a 10× error cut); Brier's payment is bounded (worst case `κ`).

## 7. Limits
Symmetric binary state with prior ½ and a single accuracy `a` known to the verifier; independent signals; a risk-neutral verifier who also controls the stopping time (no deadline); linear cost `c`. Not treated: heterogeneous check quality or cost, unknown `a` (the verifier learns it while stopping, which breaks the lattice), risk aversion (see `risk-averse-scoring`), several verifiers (`multi-verifier-audit`), or stopping observed by the principal (peeking as a signal). The anytime-valid statistics in `sequential-slashing` and `forecast-duel` are the principal's mirror image of this problem. Related: Wald (1945) on sequential tests, Arrow–Blackwell–Girshick (1949) on Bayes stopping, Frongillo and Waggoner on scoring-rule design and elicitation with costly information, Chen and Waggoner on informational substitutes and complements. Synthetic parameters throughout.
