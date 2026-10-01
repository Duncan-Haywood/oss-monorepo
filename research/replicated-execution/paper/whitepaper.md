# Replication, Stake and Blind Collusion: What Secret Task Assignment Buys

*Stylised model; MIT licensed. Code: `src/replicated_execution`, results: `experiments/results.txt`.*

## Abstract
A decentralised training or inference job is run on `k` randomly assigned workers and results are compared; a disagreement triggers a dispute that one honest replica wins, and the loser forfeits stake `S` (the refereed setting of `verification-game` and `dispute-arity`). A colluding coalition holding a fraction `β` of the workers earns gain `G` if a wrong result is accepted. We show that whether assignment is **secret** or **public** changes the economics qualitatively. With secret assignment a colluder cannot tell whether its co-replicas are friends, so cheating is a coordination game: universal cheating is profitable iff `β^{k−1} > S/(G+S)`, honesty is the unique equilibrium iff `S ≥ Gβ^{k−1}/(1−β^{k−1})`, and this stake falls geometrically in `k`. With public assignment and free abstention colluders cheat only when all `k` replicas are theirs, at zero risk: the corruption rate is `β^k` **whatever the stake**, so only replication helps. If the coalition learns the true assignment with probability `λ` (a leak), a floor `λβ^k` survives any stake. All formulas are matched by Monte Carlo.

## 1. Model
`n` workers, `m` colluders (`β = m/n`). A job goes to `k` distinct uniformly chosen workers. If replicas disagree, a dispute is run, an honest replica prevails and each deviating replica loses `S`. If every replica returns the same wrong answer, each colluder earns `G`. Honest payoff is normalised to 0. Under *secret* assignment, a colluder knows only that it was assigned. Let `p = C(m−1,k−1)/C(n−1,k−1)` be the probability that its `k−1` co-replicas are all colluders (`→ β^{k−1}` for large `n`).

## 2. Secret assignment: a coordination game
Suppose every other colluder cheats independently with probability `π`. A cheating colluder is not caught only if all `k−1` co-replicas are colluders that also cheat, probability `x = pπ^{k−1}`. Its payoff is `xG − (1−x)S`, positive iff `x > θ := S/(G+S)`.

* **Universal cheating (`π=1`) is an equilibrium iff `p > θ`.** Equivalently honesty is the *unique* equilibrium iff `S ≥ S_unique(k) = G p/(1−p)`. With `p = β^{k−1}`: `S_unique = Gβ^{k−1}/(1−β^{k−1})`, geometric in `k`. At `β=0.5`, `G=1`: 1.0, 0.33, 0.14, 0.03, 0.008 for `k=2,3,4,6,8` (E1). No replication (`k=1`) needs infinite stake: the "co-replicas" are vacuously colluders.
* **Below that stake the game has two stable equilibria and an unstable interior one** at `π* = (θ/p)^{1/(k−1)}`. Replicator dynamics from `π*−0.05` go to 0 and from `π*+0.05` go to 1, at every stake tested (E3). If the coalition's initial propensity to cheat is uniform, the basin of cheating is `1−π*`; a stake of `0.75 S_unique` (`β=.5`, `k=3`) leaves a 10.6% basin, `0.5 S_unique` 24%. Stake for a basin of at most `ε` is `G t/(1−t)` with `t = p(1−ε)^{k−1}`: at `β=.5`, `k=3`, `ε=1%` needs 0.3245 versus 0.3333 for uniqueness. Honest reading: the "coordination premium" is small once `ε` is tiny, so the unique-honesty stake is the number to use.
* **Payoffs match simulation** (E2: `n=30, m=12`, 200k trials): formula −1.5936 vs MC −1.5928 at `k=3, π=1`; all six cells within 0.007.

**Design rule.** Choose `k` to minimise `k·c + r·S_unique(k)` (`c` per-replica cost, `r` cost of capital on stake). Example, `G=10, c=1`: `β=0.3` gives `k=2` when stake is cheap (`r=0.1`), `k=3` at `r=1`; at `β=0.7` it needs `k=3` and `k=6` respectively (E6). Larger coalitions and costlier capital push toward more replication.

## 3. Public assignment: stake is useless
If assignment is visible before execution and workers may abstain or defect selectively, colluders cheat exactly when all `k` replicas are theirs. There is never a dispute and never a slash, so stake has nothing to bite on. The fraction of corrupted jobs is `C(m,k)/C(n,k)` (`≈β^k`), independent of `S` (E4, `n=100`, `m=30`): 0.0879, 0.0251, 0.0070, 0.0019 for `k=2..5`, matched by Monte Carlo to within sampling error (0.0868, 0.0252, 0.0070, 0.0018). The only lever is replication: `k ≥ ln ε/ln β`, e.g. `k=7` for `β=0.5` and `ε=1%`. Secret assignment (VRF-sealed, revealed only with the result) turns a `β^k`-per-job floor into zero at finite stake.

## 4. Leakage floor
Let the coalition learn the true assignment with probability `λ` per job (timing side channels, network position, a leaky VRF). Then it attacks safely when all replicas are colluders, and the corruption rate is `λβ^k` plus a secret-game term that is zero at `S ≥ S_unique`. Stake cannot remove the `λβ^k` term (E5: `λ=0.1, 0.5, 1` at `β=.3`, `k=3` give 0.0025, 0.0126, 0.0250 against 0.0025, 0.0126, 0.0251 predicted). To keep the floor ≤ 10⁻⁴ per job at `β=0.3` needs `k=8` at `λ=1`, `6` at `λ=0.1` and `4` at `λ=0.01`: **each order of magnitude of leak prevention is worth about two replicas**.

## 5. Limitations and connections
The model has one coalition, independent uniform assignment, a perfect dispute (see `dispute-arity`, `reproducible-refereed-training` for why disputes are not free or perfectly decidable), no honest false positives, and a one-shot payoff (repeated play and reputation are out of scope; see `sybil-stake` for identity splitting, which inflates `β` and is not modelled here). The "leak" is a single parameter rather than a channel model. The equilibrium selection claim is about dynamics of a stylised symmetric game, not about real coalitions. The result on public assignment is a design warning rather than a theorem beyond the elementary count. The contribution is the clean separation of what stake and replication each purchase, with exact finite-pool formulas and executable checks.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (11 tests) and `PYTHONPATH=src python3 experiments/run.py`.
