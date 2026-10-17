"""Finite-sample noise in multi-task peer prediction (Dasgupta-Ghosh / correlated agreement, binary reports).
Latent Y~Bern(p); verifier k reports x_k in {0,1} with P(x=1|Y=1)=a_k, P(x=0|Y=0)=b_k, informativeness g_k=a_k+b_k-1.
Infinite-sample pay of i against peer j: 2*Cov(x_i,x_j) = 2 p(1-p) g_i g_j. With n tasks two estimators:
  fresh   : mean agreement on n bonus tasks minus agreement of x_i, x_j on independent penalty tasks (one fresh pair per bonus task);
  plug-in : mean agreement minus f_i f_j+(1-f_i)(1-f_j) from empirical frequencies = 2 * (biased sample covariance).
Everything is stated on a joint table [(u, v, prob)] so that rankings (u=x1-x2) reuse the same formulas."""
import math
import random

__all__ = ["joint", "table_stats", "cov_var_exact", "fresh_stats", "plugin_stats", "enumerate_plugin",
           "sample_pairs", "score_fresh", "score_plugin", "sample_size", "normal_rent", "deductible_for_rent",
           "rank_table", "phi", "phi_inv"]


def phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def phi_inv(p):
    lo, hi = -10.0, 10.0
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if phi(mid) < p else (lo, mid)
    return (lo + hi) / 2


def joint(p, ai, bi, aj, bj):
    """Joint table [(xi, xj, prob)] of two conditionally independent binary reports."""
    out = []
    for y, py in ((1, p), (0, 1 - p)):
        pi1 = ai if y else 1 - bi
        pj1 = aj if y else 1 - bj
        for xi in (0, 1):
            for xj in (0, 1):
                pr = py * (pi1 if xi else 1 - pi1) * (pj1 if xj else 1 - pj1)
                out.append((xi, xj, pr))
    return out


def table_stats(t):
    """(mu_u, mu_v, var_u, var_v, cov, mu22) with mu22=E[(u-mu_u)^2 (v-mu_v)^2]."""
    mu = sum(u * pr for u, v, pr in t)
    mv = sum(v * pr for u, v, pr in t)
    vu = sum((u - mu) ** 2 * pr for u, v, pr in t)
    vv = sum((v - mv) ** 2 * pr for u, v, pr in t)
    c = sum((u - mu) * (v - mv) * pr for u, v, pr in t)
    m22 = sum((u - mu) ** 2 * (v - mv) ** 2 * pr for u, v, pr in t)
    return mu, mv, vu, vv, c, m22


def cov_var_exact(t, n):
    """Exact variance of the UNBIASED sample covariance s_uv of n iid pairs (n>=2):
    (mu22 - c^2)/n + (vu*vv + c^2)/(n(n-1))."""
    _, _, vu, vv, c, m22 = table_stats(t)
    return (m22 - c * c) / n + (vu * vv + c * c) / (n * (n - 1))


def plugin_stats(t, n):
    """(mean, variance) of the plug-in payment S = 2 * (1/n) sum (u-ubar)(v-vbar) = 2 (n-1)/n s_uv (exact, binary/any u,v)."""
    c = table_stats(t)[4]
    k = 2 * (n - 1) / n
    return k * c, k * k * cov_var_exact(t, n)


def fresh_stats(t, n):
    """(mean, variance) of the fresh-penalty payment for binary reports (u,v in {0,1}): agreement mean a, penalty pi."""
    mu, mv, _, _, c, _ = table_stats(t)
    a = sum(pr for u, v, pr in t if u == v)
    pi = mu * mv + (1 - mu) * (1 - mv)
    return a - pi, (a * (1 - a) + pi * (1 - pi)) / n


def enumerate_plugin(t, n):
    """Exact (mean, variance) of the plug-in payment by enumerating all |t|^n samples (small n only)."""
    import itertools
    m = s2 = 0.0
    for combo in itertools.product(t, repeat=n):
        pr = 1.0
        for _, _, q in combo:
            pr *= q
        ub = sum(u for u, _, _ in combo) / n
        vb = sum(v for _, v, _ in combo) / n
        s = 2 * sum((u - ub) * (v - vb) for u, v, _ in combo) / n
        m += pr * s
        s2 += pr * s * s
    return m, s2 - m * m


def sample_pairs(t, n, rng):
    r = rng.choices(range(len(t)), weights=[x[2] for x in t], k=n)
    return [(t[i][0], t[i][1]) for i in r]


def score_plugin(pairs):
    n = len(pairs)
    ub = sum(u for u, _ in pairs) / n
    vb = sum(v for _, v in pairs) / n
    return 2 * sum((u - ub) * (v - vb) for u, v in pairs) / n


def score_fresh(pairs, other):
    """Agreement on the bonus pairs minus agreement of x_i from one fresh task with x_j from another (independent draws):
    `other` is a second list of pairs, from which u of task k is paired with v of the neighbouring task k+1."""
    n = len(pairs)
    pen = sum(other[k][0] == other[(k + 1) % n][1] for k in range(n))
    return sum(u == v for u, v in pairs) / n - pen / n


def sample_size(mean_alt, sd1, sd0, alpha, beta):
    """Tasks n so that a one-sided test 'S > z_alpha sd0/sqrt(n)' has power 1-beta; sd's are per-task (sd*sqrt(n) constant)."""
    return ((phi_inv(1 - alpha) * sd0 + phi_inv(1 - beta) * sd1) / mean_alt) ** 2


def normal_rent(mean, sd, tau=0.0):
    """E[(S - tau)^+] for S~N(mean, sd^2)."""
    z = (mean - tau) / sd
    return sd * (math.exp(-z * z / 2) / math.sqrt(2 * math.pi) + z * phi(z))


def deductible_for_rent(mean, sd, eps):
    """Smallest tau >= 0 with E[(S-tau)^+] <= eps, by bisection."""
    lo, hi = 0.0, mean + 12 * sd
    if normal_rent(mean, sd, 0.0) <= eps:
        return 0.0
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if normal_rent(mean, sd, mid) > eps else (lo, mid)
    return hi


def rank_table(p, a1, b1, a2, b2, aj, bj):
    """Table for u=x1-x2 (in {-1,0,1}) against peer report v=xj: S1-S2 = 2 * biased cov(xj, x1-x2)."""
    out = {}
    for y, py in ((1, p), (0, 1 - p)):
        p1 = a1 if y else 1 - b1
        p2 = a2 if y else 1 - b2
        pj = aj if y else 1 - bj
        for x1 in (0, 1):
            for x2 in (0, 1):
                for xj in (0, 1):
                    pr = py * (p1 if x1 else 1 - p1) * (p2 if x2 else 1 - p2) * (pj if xj else 1 - pj)
                    k = (x1 - x2, xj)
                    out[k] = out.get(k, 0) + pr
    return [(u, v, pr) for (u, v), pr in out.items()]
