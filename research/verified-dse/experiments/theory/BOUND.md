# A regret bound for successive halving from rung inversions

Written with AI assistance (Claude Code). Programme `verified-dse`, milestone 6. The statement below is elementary
and I have not found it stated for rung-based chip-flow search; it may well be known in the
bandit literature in another form (for example, as a deterministic special case of the analysis in Jamieson &
Talwalkar, [arXiv:1502.07943](https://arxiv.org/abs/1502.07943), which is not checked line by line here), so it is
offered as a clean tool, not as a novelty claim.

## Setting
A finite pool X of candidates, each with a routed value y(x) > 0 (lower is better, here area x delay). A cheap rung r
has a score s_r(x); the search ranks by s_r (ties broken arbitrarily, including adversarially).

**Definition (inversion).** iota_r = max(0, max over pairs x, x' in X with s_r(x) <= s_r(x') of log y(x) - log y(x')).
It is the worst factor by which rung r can put a candidate ahead of (or level with) a truly better one. It is
invariant to monotone transformations of s_r, needs no model of the bias, and is 0 exactly when s_r never ranks a
worse candidate ahead of a better one (ties count as ahead).

**Algorithm.** Successive halving with cut rungs r_1, ..., r_m and survivor counts k_1 >= ... >= k_m >= 1: at cut j,
keep the k_j entrants with the lowest s_{r_j}. Finally evaluate the survivors at the routed rung and return the best.

## Proposition
The returned value y_hat satisfies log y_hat - log y* <= iota_{r_1} + ... + iota_{r_m}, where y* = min over X of y.

## Proof
Let A_0 = X and A_j the survivors after cut j. Claim: min over A_j of log y <= min over A_{j-1} of log y + iota_{r_j}.
Let x be a minimiser of y over A_{j-1}. If x is in A_j the claim holds with room to spare. Otherwise x was cut, so all
k_j >= 1 survivors z in A_j have s_{r_j}(z) <= s_{r_j}(x) (a cut keeps the lowest scores, ties included, so an
entrant that is cut is ranked no better than every survivor). Take any survivor z: the pair (z, x) has s(z) <= s(x), so
by definition log y(z) - log y(x) <= iota_{r_j}. Hence min over A_j of log y <= log y(z) <= log y(x) + iota_{r_j}.
Chaining the m claims from A_0 (whose minimum is log y*) gives the Proposition; the final routed evaluation is exact.
The inversion over the pool dominates the inversion over any subset A_{j-1}, so using the pool-wide iota is valid. QED.

## What it does and does not say
- It is a worst-case bound with a deterministic pool: it charges the single worst pair, not the pair that matters for
  the optimum, so it is loose by construction (see `results.txt`: realised regret is a small fraction of it).
- It does not use k_j at all. A bound that improves as k_j grows (the optimum is cut only if k_j candidates outrank it)
  needs a distribution over ranks, which is the probabilistic version and is **open**: replace the maximum by a
  quantile of the pairwise inversions, and relate that quantile to a routed pilot. The pilot's own maximum is always
  a lower bound on iota, so a pilot cannot certify the bound, only suggest its size (measured in `results.txt`).
- Where iota is near the spread of y, the bound is vacuous, which is the case for the generic-gate rung on this table.
