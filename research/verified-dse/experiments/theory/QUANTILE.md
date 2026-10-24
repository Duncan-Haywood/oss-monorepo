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
