# Rollout commons: free-riding, price of anarchy and matching subsidies in swarm RL post-training

**Abstract.** Decentralised RL post-training lets peers share rollouts, so each agent learns from its own samples plus discounted samples from the swarm. Generating rollouts is costly and benefits are non-rival, a public-goods game. With log value and a peer-rollout discount `θ`, symmetric Nash play gives every agent exactly the learning level of an agent acting alone, whatever the swarm size, and total effort saturates at `(a/c−1)/θ`; the efficient effort grows linearly in N, so welfare per agent is 2.2× higher at N=16 and 4.5× at N=256 (`a/c=3, θ=0.5`). At `θ=1` only the single agent with the largest `a_i/c_i` generates. A per-rollout matching subsidy equal to the marginal value a rollout confers on peers implements the optimum exactly (verified against a projected-Newton optimiser on random instances); symmetrically it covers a fraction `θ(N−1)/(1+θ(N−1))` of cost. If rewards are paid per claimed rollout, junk rollouts of cost `ε` beat honesty iff `c−ε > p(τ+F)` for audit probability `p`, forfeiture of `τ` and fine `F`, so a pure forfeiture (F=0) cannot deter. All statements are exact or checked by tests; code and reproducible experiments are in this repository.

## 1. Model
Agents `i=1..N` produce `x_i ≥ 0` rollouts at unit cost `c_i`; all rollouts are visible to all. Agent i's effective sample is `y_i = x_i + θ Σ_{j≠i} x_j`, `θ∈[0,1]` discounting peers' (off-policy, less diverse) rollouts. Payoff `u_i = a_i ln(1+y_i) − c_i x_i`. Welfare is `Σ u_i`. This is the Bergstrom–Blume–Varian voluntary public-goods game with imperfect substitutability; the point here is the quantitative consequences for a sharing protocol such as RL Swarm/SAPO-style rollout exchange.

## 2. Nash equilibrium
Best response `x_i = max(0, a_i/c_i − 1 − θ X_{−i})`. Symmetric case, with `k = 1+θ(N−1)`: `x = (a/c−1)/k`, so `y = a/c − 1` **independent of N**, and total effort `N(a/c−1)/k → (a/c−1)/θ`. Adding agents to the swarm buys no additional learning per agent, only savings on cost: welfare per agent rises only because each pays less. At `θ=1` every agent has `y_i = X`, so only agents with `a_i/c_i` at the maximum contribute (a test with four heterogeneous agents finds exactly the best one, total effort `max(a/c) − 1`).

## 3. Efficiency and price of anarchy
Maximising welfare gives symmetric `x = a/c − 1/k` and `y = ka/c − 1`, `k` times the private level in `a/c` terms. E1 (`a/c=3, θ=0.5`): total effort Nash / efficient is 2.67/4.67 at N=2, 3.56/22.2 at N=8, 3.98/766 at N=256 (ratio 192); welfare per agent efficient/Nash is 1.11, 1.38, 1.76, 2.23, 3.33, 4.53 at N=2, 4, 8, 16, 64, 256. The gap is unbounded because efficient welfare grows like `ln N` per agent while Nash welfare is bounded.

Heterogeneity (E2, N=20, `a=3`, log-normal costs, 100 draws): Nash has 8.3 contributors at `θ=0.3, σ=0.25`, 3.3 at `θ=0.7`, and exactly 1 at `θ=1`; Nash welfare is 42–49% of efficient in all six cells (minimum 0.375).

## 4. Matching subsidy
Paying agent i `τ_i` per rollout, with `τ_i = θ Σ_{j≠i} a_j/(1+y_j)` evaluated at the efficient allocation, changes the first-order condition to the social one, so Nash play under subsidy equals the optimum (tested on 10 random instances to 1e-6; `τ_i < c_i` in all). Symmetrically `τ/c = θ(N−1)/k`: 0.33 at N=2, 0.78 at N=8, 0.98 at N=128 (`θ=0.5`); the swarm should subsidise nearly all generation cost, and the budget is 23–45% of efficient welfare in E3 (symmetric) and 24–37% in the E2 cells, which a protocol must fund from emissions or fees. Rewards proportional to others' measured benefit are the practical form: they are the same object as leave-one-out payments studied in `data-valuation-replication`.

## 5. Junk rollouts
A subsidy per claimed rollout invites fabricated ones of cost `ε<c`. Audit each claim with probability `p`; a caught claim forfeits `τ` and pays `F`. Honest net is `τ−c`, junk `(1−p)τ − pF − ε`, so junk wins iff `c−ε > p(τ+F)` and deterrence needs `p ≥ (c−ε)/(τ+F)` (Monte Carlo at the threshold gives −0.200 vs −0.200 honest for F=2, and +0.25 at half the rate). With `c=1, ε=0.1, τ=0.8`: `p*=0.50, 0.32, 0.155` for `F=1,2,5`; with `F=0` even `p=1` fails because `τ < c−ε`. Stake therefore substitutes for audits exactly as in `spot-check-slashing`.

## 6. Implications
(i) Do not read growth in swarm size as growth in learning: without incentives the private optimum caps every agent's effective sample. (ii) Pay for measured downstream benefit to peers, not for volume. (iii) Fund subsidies for ~`θ(N−1)/(1+θ(N−1))` of cost. (iv) Couple payments with audit-and-slash calibrated as in §5. (v) `θ` (transfer efficiency of a rollout) is the key measurable; it is the diversity/off-policy quantity a swarm should estimate.

## 7. Limits
Log value, static one-shot game, homogeneous rollout quality except a single `θ`, no learning dynamics, no cost of communication, no strategic misreporting of rollout quality (only fabrication). The subsidy needs `a_j` and `y_j`, which are private. Numbers are exact for symmetric formulas and single-seed for E2 (seed 2).
