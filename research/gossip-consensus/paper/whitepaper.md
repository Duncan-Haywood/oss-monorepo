# Gossip consensus for decentralised training: exact contraction laws and one stubborn node

*Working note, MIT licensed. Stylised; pure-Python numerical checks on scalar "parameters", no claims about any deployed protocol.*

## Motivation
Decentralised training over heterogeneous, unreliable devices cannot assume a global all-reduce.
Pairwise averaging with a random partner (the communication pattern of gossip-style methods such as NoLoCo) replaces it, and `robust-aggregation` asked what a Byzantine fraction does to a *one-shot* aggregate.
This note asks the analogous questions for *repeated pairwise gossip*: how fast does disagreement die, what does local noise leave behind, and what can a single node that refuses to move do to the honest consensus?

## Model (`src/gossip_consensus/model.py`)
n nodes hold scalars x_i. Disagreement is Φ = Σ(x_i − x̄)². A pair update moves both nodes to their midpoint (or by at most τ/2 each, a trust-region clip); the mean of any group of mutually gossiping nodes is conserved.

## Results (`experiments/results.txt`)
**R1 (exact contraction).** One uniformly random pair reduces Φ by (x_i−x_j)²/2, and Σ_{i<j}(x_i−x_j)² = nΦ, so **E[Φ′] = Φ(1 − 1/(n−1))**. This is an identity, checked over all pairs to 1e-12. A uniformly random perfect matching gives **E[Φ′] = Φ·(n−2)/(2(n−1))**, tending to ½ (Monte Carlo 0.4958 vs 0.4961 at n=128).

**R2 (n-free round count).** Because the matching factor is ≈½, about 20 matching rounds cut E[Φ] by 10⁻⁶ whether n is 64 or 10⁶. All-reduce needs one round but n−1 messages per node in the worst topology; gossip trades a constant factor in rounds for O(1) messages per node per round.

**R3 (noise floor).** If each round first adds independent variance s² per node (local SGD drift) and then a matching round runs, **Φ* = (n−1)(n−2)s²/n**, i.e. per-node spread ≈ s². Simulation matches to 0.3% (29.07 vs 29.06 at n=32; 20 000 rounds). The residual disagreement after gossip is about one round's worth of local drift, so gossip is as good as exact averaging *before* an all-reduce would run, and never better.

**R4 (one stubborn node wins, geometrically).** If node 0 holds c and others gossip with uniformly random partners, honest-mean gap obeys **E[c − m_t] = (c − m_0)(1 − 1/(n(n−1)))^t** exactly (matches 49.99 vs 49.99 at t=2000, n=16, c=50). Unclipped averaging offers no protection: the honest set converges to the attacker's value, at a rate set by how often the attacker is sampled (2/n per step).

**R5 (clipping bounds the rate, not the destination).** With a trust-region clip τ, the honest-mean drift is at most **τ/(n(n−1)) per step**, attained when the attacker's value is far away (0.85 vs bound 0.83 at t=100, τ=2; 16.60 vs 16.67 at t=2000). The honest cluster also keeps low internal disagreement (0.13/node at τ=2 versus 37 unclipped mid-capture). So clipping turns capture from a fast geometric race into a linear, τ-proportional creep that an audit or an anchor can outrun. It is not a fix by itself: over T steps the attacker still moves the consensus by up to Tτ/(n(n−1)).

**R6 (price of clipping).** With no attacker and initial spread 10, τ=20 costs nothing measurable, τ=5 costs about 10× residual after 300 steps, and τ=1 (below the honest spread) fails to converge in that horizon (2.3 per node). τ should sit above honest disagreement and below the tolerance the referee would accept.

## Implications
* Comparing verifiable-training designs (`reproducible-refereed-training`, `spot-check-slashing`): a gossip protocol needs an *external anchor* (a committed checkpoint the referee can check) because R4 shows the honest set alone cannot resist a stubborn node.
* R5 gives the audit cadence: to bound drift by D, audit at least every D·n(n−1)/τ steps.
* Unlike the one-shot median in `robust-aggregation`, per-exchange clipping has no breakdown *point* but does have a breakdown *time*.

## Limits
Scalar parameters, uniform random partner selection, a single non-adaptive stubborn node (an adaptive attacker who picks c each step is not analysed), no communication delays, no compression, no non-convex training dynamics. The trust-region clip is one option; median-of-partners or reputation weights are open.
