# A distribution-free pilot quantile of pair inversions

Written with AI assistance (Claude Code). Programme `verified-dse`, milestone 7a. Elementary (an order-statistic
fact); offered as a tool, not a novelty claim.

**Setting.** A pool X of N candidates, rung score s, routed value y > 0. For an unordered pair {x, x'} let
v = max(0, log y(x) - log y(x')) if s(x) <= s(x'), and symmetrically the other way (both when scores tie). The
maximum of v over all pairs is the inversion iota of `BOUND.md`.

**Claim.** Draw n pairs uniformly at random, disjoint (m = 2n pilot points, without replacement), let q be the largest
pilot v, and let F(q) be the share of all N(N-1)/2 pool pairs with v > q. Then P(F(q) > alpha) <= (1 - alpha)^n for
iid pairs, so n = ceil(ln delta / ln(1 - alpha)) pairs give F(q) <= alpha with probability at least 1 - delta.
(alpha = delta = 0.2: 8 pairs, 16 points; 0.1: 22 pairs, 44 points.)

**Proof (iid pairs).** If F(q) > alpha, every pilot pair has v <= q yet the share of pairs with v > q exceeds alpha, so each of
the n pilot pairs falls in the complementary set, whose probability is below 1 - alpha; independence gives
(1 - alpha)^n. Precisely: let t be the (1 - alpha) quantile of v; F(q) > alpha forces q < t, i.e. all n pilot values
below t, probability at most (1 - alpha)^n. For disjoint pairs drawn without replacement from a finite pool the
pairs are not independent; `quantile.py` checks the coverage empirically instead of assuming it (min 0.835 against
nominal 0.8 over 60 group-rung cells).

**What it does not give.** Halving's regret depends on the pairs (optimum, its k rivals), not on a random pair, so
the share bound does not turn into a regret guarantee. See the LOG entry.

## Milestone 35: the disjoint-pair step was not proved, and a rigorous version
Written with AI assistance. The proof above is exact for pairs drawn independently. The pilot draws them **disjoint**
(without replacement), where "independence gives" does not apply. `disjoint_check.py` (no flow run;
`disjoint_results.txt`) shows the gap is real in general: for a graph H of "good" pairs with density d, the probability
that n disjoint random pairs all lie in H can exceed d^n (N = 6, n = 3: 8.3 times d^n at d = 0.2; N = 7, n = 3: 3.3 times;
N = 4 to 6 exhaustive over all graphs, N = 7 over 300,000 random graphs). At the threshold the claim needs (d < 1 - alpha =
0.8) a hill-climb over graphs found no violation (N = 10 and 12, n = 3 to 6, best 0.255 against 0.262 at N = 12, n = 6; the
margin shrinks as 2n approaches N), and the two natural adversaries, a bad clique and bad hub points, are conservative at
N = 50 (ratio to the bound at most 0.97 for n = 8, 0.29 for n = 22). So: no counterexample at the claim's threshold, no proof either.

**Rigorous version (what the paper should state).** Draw the n pairs independently, each a uniform pair of distinct
pool points; points may repeat across pairs. The proof above then holds verbatim, P(F(q) > alpha) <= (1 - alpha)^n, and
the pilot costs at most 2n routed points (fewer when a point repeats), so the cost bound is unchanged. The empirical
coverage of 0.835 or more was measured for the disjoint scheme; for the with-replacement scheme (milestone 36, `with_replacement.py`) coverage over the same 60 cells is 0.826 at minimum (median 0.864) at about 14 distinct pilot points of 16 (pools of 50 to 52).
