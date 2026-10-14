"""Allocating a scarce audit budget across heterogeneous jobs against a best-responding cheater (Stackelberg).

Job j: a worker who cheats unaudited gains g_j; audited (probability p_j) it forfeits stake S. Cheating pays iff
(1-p)g > pS, i.e. p < t_j = g_j/(g_j+S) (ties -> honest). An unaudited cheat costs the principal harm h_j; an audited one is
corrected (harm 0). Principal picks p_j with sum p_j <= B (expected audits), the cheater best-responds job by job.
Loss on job j: h_j (1-p_j) if p_j < t_j, else 0.
"""
import itertools, math, random

__all__ = ["threshold", "full_cost", "uniform_cost", "loss", "total_loss", "brute_force", "greedy", "uniform_policy",
           "min_stake_for_budget", "simulate_loss", "lp_bound"]


def threshold(g, S):
    """Deterrence probability t = g/(g+S)."""
    return g / (g + S)


def full_cost(gs, S):
    """Expected audits to deter every job: sum g_j/(g_j+S)."""
    return sum(threshold(g, S) for g in gs)


def uniform_cost(gs, S):
    """Audits if one common probability must deter all jobs: n * max_j t_j."""
    return len(gs) * max(threshold(g, S) for g in gs)


def loss(p, h, t):
    return 0.0 if p >= t else h * (1 - p)


def total_loss(ps, hs, gs, S):
    return sum(loss(p, h, threshold(g, S)) for p, h, g in zip(ps, hs, gs))


def brute_force(hs, gs, S, B):
    """Exact optimum. Optimal policies deter a set D exactly (p=t) and put the remainder on the single best undeterred job
    (loss slope h_j > 0, capped below t_j). Enumerate D and k. Returns (min loss, D, k, partial p)."""
    n = len(hs); ts = [threshold(g, S) for g in gs]; best = (sum(hs), (), None, 0.0)
    for r in range(n + 1):
        for D in itertools.combinations(range(n), r):
            c = sum(ts[j] for j in D)
            if c > B + 1e-12:
                continue
            base = sum(hs[j] for j in range(n) if j not in D); rem = B - c
            cand = (base, D, None, 0.0)
            for k in range(n):
                if k in D:
                    continue
                p = min(rem, ts[k] * (1 - 1e-12))
                L = base - hs[k] * p
                if L < cand[0]:
                    cand = (L, D, k, p)
            if cand[0] < best[0]:
                best = cand
    return best


def greedy(hs, gs, S, B):
    """Density greedy: deter jobs in decreasing h_j/t_j = h_j(g_j+S)/g_j while they fit, spending leftover on the best
    undeterred job; also try the best single deterrable job and pure partial spending on the largest-harm job.
    OPT <= 2*knapsack candidate + partial candidate, so the best candidate prevents >= 1/3 of OPT's harm.
    Returns (loss, deterred set)."""
    n = len(hs); ts = [threshold(g, S) for g in gs]
    order = sorted(range(n), key=lambda j: -hs[j] / ts[j])
    D = []; c = 0.0
    for j in order:
        if c + ts[j] <= B + 1e-12:
            D.append(j); c += ts[j]
    def finish(D, c):
        rest = [j for j in range(n) if j not in D]; L = sum(hs[j] for j in rest); rem = B - c
        if rest:
            k = max(rest, key=lambda j: hs[j]); L -= hs[k] * min(rem, ts[k] * (1 - 1e-12))
        return L
    best = (finish(D, c), tuple(D))
    alt = finish([], 0.0)  # partial-only: when B < t_j the linear slope h_j beats density-ordered deterrence
    if alt < best[0]:
        best = (alt, ())
    for j in range(n):
        if ts[j] <= B + 1e-12:
            alt = finish([j], ts[j])
            if alt < best[0]:
                best = (alt, (j,))
    return best


def uniform_policy(hs, gs, S, B):
    """Audit every job with the same p = B/n."""
    p = B / len(hs)
    return total_loss([p] * len(hs), hs, gs, S)


def min_stake_for_budget(gs, B, lo=0.0, hi=1e9):
    """Least stake S with full_cost(gs,S) <= B (bisection; cost is decreasing in S). Requires B > 0."""
    for _ in range(200):
        mid = (lo + hi) / 2
        if full_cost(gs, mid) <= B:
            hi = mid
        else:
            lo = mid
    return hi


def lp_bound(hs, gs, S, B):
    """Fractional-knapsack upper bound on harm prevented (relaxation that lets a job be partly deterred)."""
    ts = [threshold(g, S) for g in gs]; order = sorted(range(len(hs)), key=lambda j: -hs[j] / ts[j])
    val = 0.0; rem = B
    for j in order:
        take = min(rem, ts[j]); val += hs[j] * take / ts[j]; rem -= take
        if rem <= 0:
            break
    return val


def simulate_loss(ps, hs, gs, S, trials, seed=0):
    """Monte Carlo with a cheater that best-responds (cheats iff expected payoff > 0), audits drawn at random."""
    rng = random.Random(seed); tot = 0.0
    for _ in range(trials):
        for p, h, g in zip(ps, hs, gs):
            if (1 - p) * g - p * S > 0 and rng.random() >= p:
                tot += h
    return tot / trials
