# Milestone schedules without enforcement: split the payment, front-load the work, and the milestone count is logarithmic

*Duncan Haywood. MIT licence. Code and exact experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A requester buys a long compute or training job from an anonymous worker with no court to enforce payment or delivery. Splitting the job into milestones limits how much either side can steal at once; the question is how few milestones are enough. We solve a stylised model exactly. Each milestone is a stage game (pre-payment, work, late payment) backed by a grim trigger that forfeits the remaining job surplus and a relationship value `W = W_r + W_w`. Results: (i) a milestone of cost `c` is self-enforcing under *some* pre-payment split iff `c ≤ F_r + F_w`, the *pooled* continuation value; paying only after delivery needs `P/W_r` equal milestones and paying only before needs `C/W_w`, but the best split needs `C/(W_r+W_w)` (110 / 25 / 20 in our example) and it does not matter who holds the relationship value; (ii) since abandoning early also forfeits the surplus of the remaining work, the largest self-enforcing milestone shrinks geometrically, the remaining cost obeys `R_k + W/s = (R_{k-1} + W/s)/(1+s)` with `s = (V−C)/C`, and the minimum number of milestones is `⌈ln(1+(V−C)/W) / ln(V/C)⌉`, *logarithmic* in `C/W` instead of linear (17 vs 100 at `C=100, V=120, W=1`); the first milestone is `1−(C−W)/V` of the job; (iii) if the relationship is only worth the cost `e` of re-entering under a new identity, `W` is capped at `e` and milestones grow as `ln(1/e)`. All counts agree with an exact stage-by-stage feasibility recursion on 2000/2000 random instances and no shorter schedule was found in 10,000 random draws.

## 1. Model
Worker cost `C`, requester value `V > C`, price `P ∈ [C, V]`. Cost and value accrue pro rata: milestone `k` costs `c_k`, is paid `p_k = (P/C) c_k`, and after it the remaining cost is `R_k`. The requester pre-pays `θ p_k`; the worker works or shirks (keeping the pre-payment); the requester pays the late `(1−θ) p_k` or refuses (keeping the output). Any defection ends the relationship. If both cooperate they keep `F_r = W_r + (V−P) R_k/C` and `F_w = W_w + (P−C) R_k/C`, the surplus of the remaining work plus the value `W` of continued trade (future jobs, reputation, un-slashed stake). Complete information, risk neutrality, no discounting inside a job.

## 2. One stage: only the pooled continuation matters
Backward induction: the requester pays iff `x = (1−θ)p ≤ F_r`; the worker works iff `x − c + F_w ≥ 0`. So a self-enforcing `θ` exists iff `max(0, c−F_w) ≤ min(p, F_r)`, which, as `p ≥ c`, is `c ≤ F_r + F_w`. This is verified against a grid over `θ` in 3000/3000 random stages. With equal milestones the last stage binds (`R = 0`), so:

| payment timing | equal milestones needed |
|---|---|
| pay after delivery (`θ=0`) | `⌈P/W_r⌉` |
| pay before work (`θ=1`) | `⌈C/W_w⌉` |
| best split | `⌈C/(W_r+W_w)⌉` |

At `C=100, P=110, W_r+W_w=5`: 220 / 23 / 20 when the worker holds most of the value, 25 / 200 / 20 when the requester does. Pure timings load the whole burden on one party's stake in the relationship; the split lets whichever party has more to lose carry the risk, and only the sum matters. Design consequence: a protocol should escrow or pre-pay a *tunable* share per milestone, not fix one side.

## 3. Front-loading: the geometric schedule
Early defection costs more than late defection, because the surplus of the remaining work is also forfeited. The stage condition with unequal milestones is `c_k ≤ W + s R_k` with `R_k = R_{k−1} − c_k`, giving the largest milestone `c_k = (W + s R_{k−1})/(1+s)` and remaining cost `R_k = (R_{k−1} − W)/(1+s)`. The map is increasing in `R_{k−1}`, so taking the largest milestone at every step leaves the least remaining cost at every step (induction), hence greedy is optimal; the recursion has fixed point `−W/s`, so `R_k + W/s = (C + W/s)(1+s)^{−k}` and the job finishes at the first `n` with `(1+s)^n ≥ 1 + Cs/W`:

`n* = ⌈ ln(1 + (V−C)/W) / ln(V/C) ⌉`,

which tends to the equal-milestone `⌈C/W⌉` as `V → C`. The first milestone is `1 − (C−W)/V` of the cost, tending to `1 − C/V` as `W → 0`. At `C=100, V=120`: `W` = 20, 5, 1, 0.2, 0.01 needs 4, 9, 17, 26, 42 milestones instead of 5, 20, 100, 500, 10⁴. Halving `W` adds only `ln 2/ln(V/C)` milestones (3.8 here). A thin margin `V/C = 1.05` at `W=1` needs 37 milestones, a generous `V/C = 4` needs 5 (E5). Along the greedy path the self-enforcing pre-payment range collapses to a point (every constraint binds until the last), so the split is pinned down: about 55–63% of each price is paid up front in E2.

## 4. Cheap identities cap the relationship value
If a defector can re-enter under a new identity at cost `e`, the effective `W` is `min(W, e)` (compare `sybil-stake`). At `W=5` the geometric schedule needs 9 milestones for `e ≥ 5`, 17 at `e=1`, 30 at `e=0.1`, 38 at `e=0.02`: the price of permissionless entry is logarithmic in `1/e` here, not linear (equal milestones: 20 → 5000).

## 5. Relation to prior work
Milestone and staged-payment contracts with limited enforcement are classical (e.g. relational-contract and self-enforcing-trade models); the pooled-continuation condition and the geometric schedule are our exact solution of this specific stage game, not a claim of novelty for the idea of staging. The setting is the payment layer of decentralised compute markets such as Gensyn's; verification of each milestone is assumed available (refereed re-execution, `verification-game`, `reproducible-refereed-training`) at cost `v` each, so the schedule minimises `n v`. Peer-prediction and scoring-rule work by Waggoner and Frongillo and coauthors supplies the verifier's report; this module prices what the *counterparties* can extract between reports.

## 6. Limitations
Complete information; a single worker and requester; value and cost accrue pro rata to cost; the output of a refused milestone stays with the requester; a defection ends the relationship (harsher or softer punishment changes `W`); no discounting or interest on pre-payments (this favours large front-loaded milestones); milestone verification is free and error-free; `W` is exogenous rather than derived from a repeated game; no coalitions. The optimality claim is for the greedy recursion within this model (proved by monotonicity, checked by random search, not by exhaustive optimisation over all real schedules). Numbers are for the stylised example.
