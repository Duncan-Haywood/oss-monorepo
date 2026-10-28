# A halving regret bound that improves with the survivor count

Written with AI assistance (Claude Code). Programme `verified-dse`, milestone 37. Elementary, and a refinement of
`BOUND.md`; offered as a tool, not a novelty claim (the bandit literature may state it in another form).

**Definition.** For a pool X, routed value y > 0 and rung score s, let R(x) = {z != x : s(z) <= s(x)} be the rivals the rung ranks
at or ahead of x (ties count as ahead). Let v_x(z) = max(0, log y(z) - log y(x)). For k >= 1,
iota^(k) = max over x of the k-th largest of {v_x(z) : z in R(x)}, taken as 0 when |R(x)| < k. Then iota^(1) = iota of
`BOUND.md`, and iota^(k) is non-increasing in k.

**Proposition.** Successive halving with cut rungs r_1..r_m keeping k_1 >= ... >= k_m points returns y_hat with
log y_hat - log y* <= sum_j iota_{r_j}^(k_j).

**Proof.** Let x minimise y over the survivors A_{j-1} of the previous cut. If x survives cut j, nothing is lost. If x is cut, the k_j
survivors all have s <= s(x), so they lie in R(x) (restricted to A_{j-1}, a subset of the pool's R(x)). Any k_j elements of a set
include one whose v_x is at most the set's k_j-th largest v_x (only k_j - 1 elements exceed it), so the best survivor z has
log y(z) - log y(x) <= iota^(k_j) (the pool-wide maximum dominates, and the k-th largest over a subset is at most that over the
superset). Chain over j as in `BOUND.md`; the final routed evaluation is exact. QED.

**What it adds.** The old bound charges the single worst pair whatever k is. This one charges the k-th worst rival of the
worst-placed candidate, so a rung that has one wild outlier ahead of the optimum but few of them costs nothing once k exceeds
that count. **What it does not give:** it is a maximum over all candidates, not only the optimum, and it needs the whole table, so
it is not pilot-checkable yet; an estimator with a coverage statement for iota^(k) is open.

**Check.** `kth.py` on the cached `rung_bias` table (40 group-rung cells, 200 random tie-breaks each): no violations;
`kth_results.txt`.

**Pilot estimate (milestone 38, exploratory, negative).** `kth_pilot.py` computes iota^(k) on a random 16-point pilot. It is a
lower bound on the true value, within about 15% at the median ratio over 55 cells, but it never reaches the truth in 80% of draws
in any cell, so it is not a certificate; `kth_pilot_results.txt`.

**Optimum-anchored refinement (milestone 39).** Only the optimum x* matters for regret: if its first cut is j, regret is at most
kappa^(k_j) + sum of iota^(k_l) over later cuts, where kappa^(k) is the k-th largest excess over x* among its rivals (0 if fewer
than k). Maximise over j. This is at most the bound above; on the cached cells it is lower in 23 of 37 (median ratio 0.89) and
never violated (`anchored.py`, `anchored_results.txt`).
