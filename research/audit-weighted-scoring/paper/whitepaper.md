# Audit-weighted scoring: keeping proper scores proper when truth is sparse and audits are predictable

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verification networks score verifiers against ground truth that exists only on audited tasks, and it is natural to audit some reports more than others (confident "accept" claims, large stakes). We show this silently breaks properness. With Brier loss and audit rate `g(r)=a+br`, a verifier paid only when audited minimises `(a+br)(r²−2pr+p)`, giving shift `≈ −b·p(1−p)/(2(a+bp))` (verified to 0.003 for small `b`) and, for steep `b`, hiding at `r=0`. Inverse-propensity weighting (pay `B/g(r)` when audited) restores exact properness for *any* positive audit rule because `E[1{audit}·B/g(r)] = L(r)`; the price is variance `E[B²]/g − L²` and a payout cap `1/g_min`. The variance-minimising audit rule is Neyman/water-filling, `g ∝ √m₂(p)`, but its gain over uniform auditing is modest (3% under a uniform prior on `p`, 11% for U-shaped priors), so the design rule is: any audit rule is safe if you weight, and choosing it mainly matters for payout caps.

## 1. Setup
A verifier holds posterior `p` for a binary task `Y` and reports `r`. Brier loss `B=(r−Y)²` has `E B = L(r) = r²−2pr+p` (minimised at `r=p`) and `E B² = p(1−r)⁴+(1−p)r⁴ =: m₄(r,p)`. Truth is observed with probability `g(r)`, via a coin independent of `Y` given the report.

## 2. The naive scheme is improper
Pay `−B` if audited, 0 otherwise: expected loss `g(r)L(r)`. Stationarity is `3b r² + (2a−4bp) r + (bp−2ap) = 0`; at `r=p` it equals `bp(1−p) ≠ 0`, so truth is never optimal once `b≠0`, and with `L''=2` the shift is `−bp(1−p)/(2(a+bp))`. E1 (`a=0.2`): `b=0.1`, `p=0.5`: shift −0.052 (formula −0.050); `b=0.3`: −0.128 (formula −0.107, first order degrading); `b=0.6`: the optimum is the corner `r=0` for `p=0.2` and `0.5`: the verifier avoids the audit by never asserting anything, giving Brier excess 0.25 at `p=0.5`. The distortion is an incentive *to be under-audited*, so it is worst exactly where the network most wants scrutiny.

## 3. Weighting restores properness
Pay `B/g(r)` when audited. Then `E = g(r)L(r)/g(r) = L(r)` for every `g>0`, so truth-telling is optimal regardless of the audit rule, even one the verifier can game. E2 (`g=0.1+0.8r`, `r=0.7`, `p=0.4`, 6·10⁵ tasks): mean 0.3301 vs 0.3300, variance 0.1142 vs exact 0.1143. Costs: variance `m₄/g − L²`, and a maximum single payment `1/g_min` (limited liability and solvency need `g_min>0`).

## 4. Choosing the audit rule
With truthful reports `E[B²] = m₂(p) = p(1−p)(1−3p+3p²)`. Minimising `E[m₂/g]` subject to `E g = γ` and `g ∈ [g_min,1]` gives `g = clip(λ√m₂(p))`. E3 (`γ=0.1`): variance ratio to uniform 0.971 for `p~U(0,1)`, 0.994 for Beta(2,2), 0.937 for Beta(1,5), 0.888 for Beta(½,½). E4: forcing `g_min=0.05` (payout ≤ 20) costs almost nothing (0.973), `g_min=0.08` (payout ≤ 12.5) 0.983. So the rule can be picked for other reasons (stake, novelty) and payout caps are cheap.

## 5. Limits
Audit coin must be independent of `Y` given the report; if audits are triggered by the *outcome* (only bad results get checked) the loss is not identified and weighting cannot fix it. Brier only; log loss has unbounded `B`, so IPW needs a clip. Single-task, risk-neutral verifiers; the variance matters for risk-averse ones (see `risk-averse-scoring`) and for detection speed (see `sequential-slashing`). Related: `spot-check-slashing`, `audit-allocation`, `noisy-referee`.
