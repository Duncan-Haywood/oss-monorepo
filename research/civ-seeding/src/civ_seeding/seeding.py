"""Seeding rules on the BCDJ villages, and a batched simulator to score them (milestone 4).

`simulate_batch` runs the three model families of `complex.simulate` for many seed sets at
once: seeds is an n x C boolean matrix, and every column is run S times with the *same* random
draws (common random numbers across candidates), so greedy steps compare seed sets on equal
noise. With C = 1 it consumes the generator exactly as `complex.simulate` does and returns the
same adoption matrix (tested).

Rules return a boolean n-vector with exactly b seeds. Ties are broken by household index.
"""
from __future__ import annotations

import numpy as np

from . import bcdj

# The milestone-3b real-data fits (sigma = 0) and two sensitivity points.
MODELS = {
    "I": dict(qN=0.05, qP=0.3),
    "T": dict(qN=0.075, qP=0.1, theta=0.5, delta=-0.25),
    "R": dict(qN=0.10, qP=0.1, gamma=0.10, delta=-0.25),
    "T60": dict(qN=0.075, qP=0.1, theta=0.6),
    "Ipub": dict(qN=0.10, qP=0.5),
}


def simulate_batch(v: bcdj.Village, beta, seeds, S: int, rng, qN: float, qP: float,
                   gamma: float = 0.0, theta: float | None = None, delta: float = 0.0,
                   return_matrix: bool = False, fast: bool = False):
    """seeds: n x C bool. Returns C x S adopter counts (or the n x C*S adoption matrix,
    column c*S + s for seed set c and run s, if return_matrix). fast: float32 products
    (greedy search only; final scores use float64, which matches `complex.simulate`)."""
    seeds = np.asarray(seeds, bool)
    if seeds.ndim == 1:
        seeds = seeds[:, None]
    n, C = seeds.shape
    base = (beta[0] + delta + v.Z @ beta[1:])[:, None]
    U = np.tile(rng.random((n, S)), (1, C))
    contagious = np.repeat(seeds, S, axis=1)
    informed = np.zeros((n, C * S), bool)
    adopted = np.zeros((n, C * S), bool)
    lq = np.log(np.clip(1 - np.array([qN, qP]), 1e-300, None))
    deg = np.maximum(v.deg, 1)[:, None]
    use_theta = theta is not None and theta <= 1
    A = v.A.astype(np.float32) if fast else v.A
    for _ in range(v.T):
        informed |= contagious
        if gamma != 0.0 or use_theta:
            k = A @ adopted.astype(A.dtype)
        if gamma != 0.0:
            p = 1 / (1 + np.exp(-(base + gamma * k)))
        else:
            p = 1 / (1 + np.exp(-base))
        new = informed & ~adopted & (U < p)
        if use_theta:
            new |= informed & ~adopted & (k / deg >= theta - 1e-12)
        adopted |= new
        lnot = (np.where(adopted, lq[1], lq[0]) * informed).astype(A.dtype)
        reach_u = np.tile(rng.random((n, S)), (1, C))
        contagious = reach_u > np.exp(A @ lnot)
    if return_matrix:
        return adopted.astype(float)
    return adopted.sum(0).reshape(C, S)


def _top(score, b):
    order = np.lexsort((np.arange(len(score)), -np.asarray(score)))
    m = np.zeros(len(score), bool)
    m[order[:b]] = True
    return m


def eigenvector(v):
    w, U = np.linalg.eigh(v.A)
    x = np.abs(U[:, -1])
    return x, w[-1]


def diffusion_centrality(v):
    """sum_{t=1..T} (A / lambda_1)^t 1, with the village's own period count T."""
    _, lam = eigenvector(v)
    q = 1.0 / lam
    x = np.ones(v.n)
    out = np.zeros(v.n)
    for _ in range(v.T):
        x = q * (v.A @ x)
        out += x
    return out


def rule_leaders(v, b, rng=None):
    return v.leader.copy()


def rule_random(v, b, rng):
    m = np.zeros(v.n, bool)
    m[rng.choice(v.n, b, replace=False)] = True
    return m


def rule_degree(v, b, rng=None):
    return _top(v.deg, b)


def rule_eigen(v, b, rng=None):
    return _top(eigenvector(v)[0], b)


def rule_diffusion(v, b, rng=None):
    return _top(diffusion_centrality(v), b)


def rule_ball(v, b, rng=None):
    """One clustered ball: breadth-first from the top-degree household; nearer layers
    first, higher degree first within a layer."""
    start = int(np.lexsort((np.arange(v.n), -v.deg))[0])
    chosen = [start]
    seen = np.zeros(v.n, bool)
    seen[start] = True
    frontier = [start]
    while len(chosen) < b and frontier:
        nxt = np.flatnonzero((v.A[frontier].sum(0) > 0) & ~seen)
        seen[nxt] = True
        nxt = nxt[np.lexsort((nxt, -v.deg[nxt]))]
        chosen.extend(nxt[: b - len(chosen)].tolist())
        frontier = nxt.tolist()
    m = np.zeros(v.n, bool)
    m[chosen] = True
    if m.sum() < b:  # graph exhausted (giant component, so only if b > n)
        m |= _top(v.deg * ~m, b - m.sum()) & ~m
    return m


def rule_patches(v, b, rng=None, size: int = 4):
    """Patches of `size`: the highest-degree household neither seeded nor next to a seed,
    plus its size-1 highest-degree unseeded neighbours; repeated until b seeds."""
    m = np.zeros(v.n, bool)
    order = np.lexsort((np.arange(v.n), -v.deg))
    while m.sum() < b:
        near = (v.A[:, m].sum(1) > 0) | m
        free = [i for i in order if not near[i]]
        c = free[0] if free else next(i for i in order if not m[i])
        m[c] = True
        nb = np.flatnonzero((v.A[c] > 0) & ~m)
        nb = nb[np.lexsort((nb, -v.deg[nb]))]
        take = nb[: min(size - 1, b - int(m.sum()))]
        m[take] = True
    return m


def rule_greedy(v, b, beta, model: dict, S: int = 32, seed: int = 0):
    """Greedy: add the household with the largest gain in mean adopters, every step on the
    same S random draws (common random numbers across candidates and steps)."""
    m = np.zeros(v.n, bool)
    for _ in range(b):
        cand = np.flatnonzero(~m)
        X = np.repeat(m[:, None], len(cand), 1)
        X[cand, np.arange(len(cand))] = True
        rng = np.random.default_rng([seed, v.village, 11])
        val = simulate_batch(v, beta, X, S, rng, fast=True, **model).mean(1)
        m[cand[int(np.argmax(val))]] = True
    return m


STRUCTURAL = {
    "leaders": rule_leaders,
    "random": rule_random,
    "degree": rule_degree,
    "eigenvector": rule_eigen,
    "diffusion": rule_diffusion,
    "ball": rule_ball,
    "patches": rule_patches,
}


# ---- milestone 5: rules without a fitted model, and rules from a partial survey ----

def _spread_pick(score, A, b):
    """Households in score order, skipping any next to a seed; if that runs out, the
    highest-score households left. A is the adjacency the rule can see."""
    n = len(score)
    order = np.lexsort((np.arange(n), -np.asarray(score)))
    m = np.zeros(n, bool)
    blocked = np.zeros(n, bool)
    for i in order:
        if m.sum() == b:
            break
        if not blocked[i]:
            m[i] = True
            blocked |= A[i] > 0
            blocked[i] = True
    if m.sum() < b:
        rest = [i for i in order if not m[i]]
        m[rest[: b - int(m.sum())]] = True
    return m


def rule_spread_degree(v, b, rng=None):
    """Top degree, no two seeds adjacent (while an independent choice remains)."""
    return _spread_pick(v.deg, v.A, b)


def rule_single_discount(v, b, rng=None):
    """SingleDiscount (Chen, Wang and Yang 2009): highest degree counting only ties to
    unseeded households, recomputed after each pick."""
    m = np.zeros(v.n, bool)
    d = v.deg.astype(float).copy()
    for _ in range(b):
        sc = np.where(m, -np.inf, d)
        i = int(np.lexsort((np.arange(v.n), -sc))[0])
        m[i] = True
        d -= v.A[:, i]
    return m


def rule_degree_discount(v, b, rng=None, p: float = 0.05):
    """DegreeDiscountIC (Chen, Wang and Yang 2009): dd = d - 2t - (d - t) t p, t = seeded
    neighbours. p = 0.05, the information model's fitted q_N."""
    m = np.zeros(v.n, bool)
    d = v.deg.astype(float)
    t = np.zeros(v.n)
    for _ in range(b):
        dd = d - 2 * t - (d - t) * t * p
        sc = np.where(m, -np.inf, dd)
        i = int(np.lexsort((np.arange(v.n), -sc))[0])
        m[i] = True
        t += v.A[:, i]
    return m


def survey(v, f, rng):
    """Survey a random share f of households; each reports its ties. Returns the surveyed
    mask, the estimated degree (exact if surveyed, surveyed neighbours / f if not) and the
    adjacency the survey saw (ties with at least one surveyed end)."""
    k = max(1, int(round(f * v.n)))
    s = np.zeros(v.n, bool)
    s[rng.choice(v.n, k, replace=False)] = True
    seen = v.A * (s[:, None] | s[None, :])
    est = np.where(s, v.deg, v.A[:, s].sum(1) / (k / v.n))
    return s, est, seen


def rule_survey_degree(v, b, rng, f: float):
    _, est, _ = survey(v, f, rng)
    return _top(est, b)


def rule_survey_spread(v, b, rng, f: float):
    _, est, seen = survey(v, f, rng)
    return _spread_pick(est, seen, b)


def rule_friend(v, b, rng):
    """Friend nomination (after Kim et al. 2015): random households each name a uniform
    random tie; seed the named until b distinct households are seeded."""
    m = np.zeros(v.n, bool)
    nbrs = [np.flatnonzero(v.A[i]) for i in range(v.n)]
    while m.sum() < b:
        i = int(rng.integers(v.n))
        if len(nbrs[i]):
            m[int(rng.choice(nbrs[i]))] = True
    return m


CENSUS_CHEAP = {
    "spread-degree": rule_spread_degree,
    "single-discount": rule_single_discount,
    "degree-discount": rule_degree_discount,
}
SURVEY_SHARES = (0.1, 0.25, 0.5)


def kendall_tau(x, y):
    """Kendall tau-b of two score vectors (ties counted as neither)."""
    x, y = np.asarray(x), np.asarray(y)
    i, j = np.triu_indices(len(x), 1)
    dx, dy = np.sign(x[i] - x[j]), np.sign(y[i] - y[j])
    nc = (dx * dy).sum()
    n0 = len(i)
    tx, ty = (dx == 0).sum(), (dy == 0).sum()
    den = np.sqrt((n0 - tx) * (n0 - ty))
    return nc / den if den else 0.0
