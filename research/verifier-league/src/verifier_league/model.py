"""Identifying the best of n verifiers with fixed probability reports r_i on i.i.d. binary tasks Y~Bern(q), Brier loss.
E loss_i = (r_i-q)^2 + q(1-q), so the best verifier is the one whose report is closest to q.
Pair (i,j): D_ij = loss_j - loss_i in [-1,1], D>0 means i better; two-valued (d1 if Y=1, d0 if Y=0).
H_ij: E D_ij <= 0. Betting e-process K_ij(t) = mean_lam prod_s (1 + lam D_ij,s): a supermartingale under H_ij."""
import math
import random

__all__ = ["loss", "best", "diffs", "mean_diff", "midpoint", "kl", "pair_rate", "rates_vs", "binding", "runner_up",
           "delay_prediction", "BET_GRID", "bets", "log_e", "League", "simulate_certify", "simulate_eliminate", "peeking_leader"]

BET_GRID = tuple(0.95 * 2 ** (-k / 2) for k in range(16))   # geometric: the optimal fraction is ~ (q-pi)/(1-pi), often small


def loss(r, q):
    return (r - q) ** 2 + q * (1 - q)


def best(rs, q):
    return min(range(len(rs)), key=lambda i: abs(rs[i] - q))


def diffs(ri, rj):
    """(d1, d0) of D_ij = loss_j - loss_i."""
    return (1 - rj) ** 2 - (1 - ri) ** 2, rj ** 2 - ri ** 2


def mean_diff(ri, rj, q):
    d1, d0 = diffs(ri, rj)
    return q * d1 + (1 - q) * d0


def midpoint(ri, rj):
    return (ri + rj) / 2


def kl(q, p):
    return q * math.log(q / p) + (1 - q) * math.log((1 - q) / (1 - p))


def pair_rate(ri, rj, q):
    """Optimal-bet log-growth of K_ij when i is better than j: KL(q || midpoint); 0 otherwise."""
    return kl(q, midpoint(ri, rj)) if mean_diff(ri, rj, q) > 0 else 0.0


def rates_vs(rs, q, i):
    """{j: pair_rate(i,j)} for every other verifier."""
    return {j: pair_rate(rs[i], rs[j], q) for j in range(len(rs)) if j != i}


def binding(rs, q):
    """The competitor that limits certification of the best verifier: the smallest rate (nearest midpoint to q)."""
    b = best(rs, q)
    r = rates_vs(rs, q, b)
    return b, min(r, key=r.get)


def runner_up(rs, q):
    """Second-best by expected loss."""
    order = sorted(range(len(rs)), key=lambda i: abs(rs[i] - q))
    return order[1]


def delay_prediction(rs, q, alpha, n_corr=1):
    """Oracle-bet certification time of the best verifier: max_j ln(n_corr/alpha)/KL(q||mid_bj)."""
    b = best(rs, q)
    return max(math.log(n_corr / alpha) / v for v in rates_vs(rs, q, b).values())


def bets(ri, rj, fracs=BET_GRID):
    """Bets scaled to the pair: (geometric) fractions of the admissible ceiling 1/max(-d), so 1+lam*D stays positive.
    (A fixed grid on [0,1) wastes almost every bet when the score gap is small and lam* >> 1.)"""
    neg = [-d for d in diffs(ri, rj) if d < 0]
    top = 1 / max(neg) if neg else 1.0
    return [f * top for f in fracs]


def log_e(n1, n0, ri, rj, lams=None):
    """log K_ij after n1 tasks with Y=1 and n0 with Y=0 (depends on the counts only)."""
    d1, d0 = diffs(ri, rj)
    lams = bets(ri, rj) if lams is None else lams
    ls = [n1 * math.log(1 + l * d1) + n0 * math.log(1 + l * d0) for l in lams]
    m = max(ls)
    return m + math.log(sum(math.exp(x - m) for x in ls) / len(ls))


class League:
    """Running pairwise mixture e-processes for all ordered pairs, updated from the shared outcome stream."""

    def __init__(self, rs, lams=BET_GRID):
        self.rs, self.lams, self.n = list(rs), lams, len(rs)
        self.lg = {}
        self.pairs = [(i, j) for i in range(self.n) for j in range(self.n) if i != j and rs[i] != rs[j]]
        self.dd = {p: diffs(rs[p[0]], rs[p[1]]) for p in self.pairs}
        ls = {p: bets(rs[p[0]], rs[p[1]], lams) for p in self.pairs}
        self.inc = {p: ([math.log(1 + l * self.dd[p][0]) for l in ls[p]], [math.log(1 + l * self.dd[p][1]) for l in ls[p]])
                    for p in self.pairs}
        self.lg = {p: [0.0] * len(lams) for p in self.pairs}

    def step(self, y):
        k = 0 if y else 1
        for p in self.pairs:
            inc = self.inc[p][k]
            v = self.lg[p]
            for a in range(len(v)):
                v[a] += inc[a]

    def log_k(self, i, j):
        if (i, j) not in self.lg:
            return 0.0
        v = self.lg[(i, j)]
        m = max(v)
        return m + math.log(sum(math.exp(x - m) for x in v) / len(v))


def simulate_certify(rs, q, alpha, T, rng, corr=1):
    """First time some i has log K_ij >= ln(corr/alpha) for every j != i. Returns (i, t) or (None, T)."""
    L = League(rs)
    thr = math.log(corr / alpha)
    for t in range(1, T + 1):
        L.step(rng.random() < q)
        for i in range(L.n):
            if all(L.log_k(i, j) >= thr for j in range(L.n) if j != i):
                return i, t
    return None, T


def simulate_eliminate(rs, q, alpha, T, rng, corr=1):
    """Successive elimination: drop i once any alive j has log K_ji >= ln(corr/alpha); stop with one survivor.
    Returns (survivor or None, stopping time, verifier-task evaluations, whether the best verifier was ever dropped)."""
    L = League(rs)
    thr = math.log(corr / alpha)
    alive = set(range(L.n))
    b = best(rs, q)
    cost = 0
    dropped_best = False
    for t in range(1, T + 1):
        cost += len(alive)
        L.step(rng.random() < q)
        out = {i for i in alive if any(j != i and L.log_k(j, i) >= thr for j in alive)}
        if b in out:
            dropped_best = True
        alive -= out
        if len(alive) == 1:
            return next(iter(alive)), t, cost, dropped_best
    return None, T, cost, dropped_best


def peeking_leader(rs, q, z, T, rng, start=20):
    """Baseline: at each t>=start declare the empirical-loss leader best if every paired z-statistic exceeds z."""
    n = len(rs)
    ps = [(i, j) for i in range(n) for j in range(n) if i != j and rs[i] != rs[j]]
    dd = {p: diffs(rs[p[0]], rs[p[1]]) for p in ps}
    s = {p: 0.0 for p in ps}
    s2 = {p: 0.0 for p in ps}
    for t in range(1, T + 1):
        y = rng.random() < q
        for p in ps:
            d = dd[p][0] if y else dd[p][1]
            s[p] += d
            s2[p] += d * d
        if t < start:
            continue
        for i in range(n):
            ok = True
            for j in range(n):
                if j == i:
                    continue
                if rs[i] == rs[j]:
                    ok = False
                    break
                p = (i, j)
                m = s[p] / t
                var = s2[p] / t - m * m
                if var <= 1e-15 or m / math.sqrt(var / t) <= z:
                    ok = False
                    break
            if ok:
                return i, t
    return None, T
