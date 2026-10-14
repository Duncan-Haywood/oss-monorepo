# Sybils, whales and the stake exponent: which reward pools are identity-proof?

*Working note, MIT licensed. Stylised; numerical experiments in pure Python, no claims about any deployed protocol.*

## Motivation
Open, permissionless verification and training protocols (`verification-game`, `wagering-modular-experts`, `holdout-market`)
cannot bind a participant to one identity. Any reward pool that divides a budget by identity weights therefore invites two
manipulations: **splitting** one stake into many identities (Sybil) and **merging** many into one (centralisation).
This note asks which weightings are indifferent to both.

## Model (`src/sybil_stake/model.py`)
A pool R is divided so identity i receives R·w_iᵅ / Σ_j w_jᵅ. An attacker with total stake S splits into k equal identities,
each costing c to register, against n honest identities of stake s.

## Results (`experiments/results.txt`)
**R1 (uniqueness of α = 1).** Split-invariance of the share for all stakes requires the weight to be additive in stake,
so wᵅ must be linear: only α = 1. E3 shows the share constant in k at α=1, increasing in k for α<1, decreasing for α>1.
This is a short additivity argument on the stated family, not a characterisation of all mechanisms.

**R2 (per-head pools are cheap to capture).** At α=0 the payoff R·k/(k+n) − c·k has continuous optimum **k\* = √(Rn/c) − n**
(matched to integers in E1: 180, 43, 12, 2 at c = 0.05…4). With n=20 and c=0.05 an attacker holding 1/21 of the stake takes 90% of the pool.
For α<1 the share still tends to 1 as k grows (α=0.5: 0.05 → 0.76 at k=4096) without any identity cost.

**R3 (deterrence fee).** The second identity is worth R·n/((n+1)(n+2)); the payoff is concave in k, so charging each
identity slightly more than this deters all splitting, and slightly less does not (E2, ±2% around the threshold, n=4, 9, 20).

**R4 (the other side: whales).** For α>1 splitting hurts but merging pays: four honest stakes of 1 among others of weight 20
gain +0.054 (α=1.25) to +0.278 (α=2) of pool share by merging (E4). α=1 is the only exponent with neither pressure.

**R5 (wagering is split-neutral).** For weighted-score wagering the coalition net is Σ w_iS_i(1 − W_C/W) minus a term
independent of its reports, so every identity should report the coalition's belief and splitting equals one large wager:
identical to 12 digits with 3 identities, and none of 361 split-report pairs beat truthful (E6, exact Brier expectation).

**Monte Carlo check.** A stake-weighted lottery agrees with the share formula (0.1806 vs 0.1799, E5).

## Implications
1. Pay linearly in stake (α=1) whenever identities are free; if per-identity payments exist (fixed fees, bounties), add a
   registration cost above R·n/((n+1)(n+2)) or convert them to stake-proportional shares.
2. Sub-linear (quadratic-funding-like) weights are only safe with strong identity binding.
3. Linear pools shift the burden to concentration risk, which stake-cap or slashing designs (`verifier-bribery`,
   `spot-check-slashing`) must address instead.

## Limits
Equal-sized identities, honest others who do not respond, a single round, no reputation, no coordination between attacker identities other than a common report;
no correlation of outcomes with identity count (e.g. voting quorum effects). Dynamic entry and honest counter-splitting are open.
