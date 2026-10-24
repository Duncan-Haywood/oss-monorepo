"""Opinion dynamics on a polarized two-camp society, and the interventions that try to move it.

One update rule covers three classic models:

* Deffuant, Neau, Amblard and Weisbuch (2000), bounded confidence: an agent moves a share
  ``mu`` of the way toward a partner whose opinion is closer than ``eps``.
* Jager and Amblard (2005), social judgement: the same, plus *repulsion* from a partner
  further away than ``tau`` (the latitude of rejection). ``tau = inf`` switches it off.
* DeGroot-style averaging is the limit ``eps >= 1``, ``tau = inf``.

Hegselmann and Krause (2002) synchronous bounded confidence is ``hk_run``; it is
deterministic and is used to check the browser port.

Opinions live in [0, 1]. Each sweep, every agent meets one random neighbour (or, with
probability ``media_p``, the broadcast source) and updates; zealots never move.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Society:
    x: np.ndarray          # opinions, shape (n,)
    group: np.ndarray      # 0 or 1, the camp each agent started in
    indptr: np.ndarray     # CSR adjacency
    indices: np.ndarray
    fixed: np.ndarray = field(default=None)  # zealots: True never update

    def __post_init__(self):
        if self.fixed is None:
            self.fixed = np.zeros(len(self.x), dtype=bool)

    @property
    def n(self):
        return len(self.x)

    @property
    def degree(self):
        return np.diff(self.indptr)


def _csr(n, edges):
    edges = np.asarray(edges, dtype=np.int64).reshape(-1, 2)
    both = np.vstack([edges, edges[:, ::-1]])
    both = both[np.lexsort((both[:, 1], both[:, 0]))]
    indptr = np.zeros(n + 1, dtype=np.int64)
    np.add.at(indptr, both[:, 0] + 1, 1)
    return np.cumsum(indptr), both[:, 1].copy()


def two_camp_edges(n, k, cross, rng):
    """Edges of a two-block random graph: n agents in two equal camps, mean degree k,
    a share ``cross`` of each agent's ties going to the other camp (homophily)."""
    group = (np.arange(n) >= n // 2).astype(np.int64)
    m = n * k // 2
    m_cross = int(round(m * cross))
    a, b = np.arange(n // 2), np.arange(n // 2, n)
    e = set()
    while len(e) < m - m_cross:
        side = a if rng.random() < 0.5 else b
        i, j = rng.choice(side, 2, replace=False)
        e.add((min(i, j), max(i, j)))
    while len(e) < m:
        i, j = rng.choice(a), rng.choice(b)
        e.add((i, j))
    return group, np.array(sorted(e))


def complete_society(x):
    n = len(x)
    i, j = np.triu_indices(n, 1)
    indptr, indices = _csr(n, np.column_stack([i, j]))
    return Society(np.asarray(x, float).copy(), np.zeros(n, dtype=np.int64), indptr, indices)


def polarized_society(n=1000, k=10, cross=0.05, spread=0.15, seed=0):
    """Two camps of n/2: camp 0 opinions uniform on [0.2 - spread, 0.2 + spread], camp 1 the
    mirror image around 0.8. ``cross`` is the share of ties that cross camps."""
    rng = np.random.default_rng(seed)
    group, edges = two_camp_edges(n, k, cross, rng)
    centre = np.where(group == 0, 0.2, 0.8)
    x = centre + rng.uniform(-spread, spread, n)
    indptr, indices = _csr(n, edges)
    return Society(x, group, indptr, indices)


def rewire_bridges(soc, share, seed=0):
    """Bridging contact: rewire ``share`` of the within-camp ties so each joins the two camps
    (one end kept, the other moved to a random member of the other camp). Degree is kept
    on the kept end; the total number of ties is unchanged."""
    rng = np.random.default_rng(seed)
    src = np.repeat(np.arange(soc.n), soc.degree)
    dst = soc.indices
    keep = src < dst
    e = np.column_stack([src[keep], dst[keep]])
    within = np.flatnonzero(soc.group[e[:, 0]] == soc.group[e[:, 1]])
    pick = rng.choice(within, int(round(share * len(within))), replace=False)
    for r in pick:
        i = e[r, 0] if rng.random() < 0.5 else e[r, 1]
        other = np.flatnonzero(soc.group != soc.group[i])
        e[r] = (i, rng.choice(other))
    e = np.unique(np.sort(e, axis=1), axis=0)
    e = e[e[:, 0] != e[:, 1]]
    indptr, indices = _csr(soc.n, e)
    return Society(soc.x.copy(), soc.group.copy(), indptr, indices, soc.fixed.copy())


def cross_share(soc):
    src = np.repeat(np.arange(soc.n), soc.degree)
    return float(np.mean(soc.group[src] != soc.group[soc.indices]))


def step(soc, rng, eps, tau=np.inf, mu=0.3, media=None, media_p=0.0):
    """One sweep: every agent meets one partner at once and updates (synchronous random pairs)."""
    n, x = soc.n, soc.x
    deg = soc.degree
    pick = soc.indptr[:-1] + (rng.random(n) * np.maximum(deg, 1)).astype(np.int64)
    pick = np.minimum(pick, len(soc.indices) - 1)
    partner = np.where(deg > 0, x[soc.indices[pick]], x)
    if media is not None and media_p > 0:
        partner = np.where(rng.random(n) < media_p, media, partner)
    d = partner - x
    ad = np.abs(d)
    move = np.where(ad < eps, mu * d, np.where(ad > tau, -mu * d, 0.0))
    move[soc.fixed] = 0.0
    np.clip(x + move, 0.0, 1.0, out=x)


def run(soc, sweeps=400, seed=0, **kw):
    rng = np.random.default_rng(seed)
    for _ in range(sweeps):
        step(soc, rng, **kw)
    return soc


def hk_step(x, eps):
    """Hegselmann-Krause: everyone moves to the mean of all opinions within eps (complete graph)."""
    near = np.abs(x[:, None] - x[None, :]) <= eps
    return (near * x[None, :]).sum(1) / near.sum(1)


def hk_run(x, eps, steps=200, tol=1e-12):
    x = np.asarray(x, float).copy()
    for t in range(steps):
        y = hk_step(x, eps)
        if np.max(np.abs(y - x)) < tol:
            return y, t
        x = y
    return x, steps


def clusters(x, gap=0.02, min_share=0.0):
    """Opinion clusters: sorted opinions split where neighbours differ by more than ``gap``;
    clusters smaller than ``min_share`` of agents are dropped (minor clusters)."""
    s = np.sort(x)
    cuts = np.flatnonzero(np.diff(s) > gap) + 1
    parts = np.split(s, cuts)
    return [float(p.mean()) for p in parts if len(p) >= min_share * len(x)]


def measures(soc):
    """gap: |mean camp 1 - mean camp 0| (camp = starting side); extreme: share within 0.05 of
    0 or 1; centre: share within 0.1 of 0.5; sd: standard deviation of all opinions."""
    x, g = soc.x, soc.group
    free = ~soc.fixed
    x, g = x[free], g[free]
    return {
        "gap": float(abs(x[g == 1].mean() - x[g == 0].mean())),
        "extreme": float(np.mean((x < 0.05) | (x > 0.95))),
        "centre": float(np.mean(np.abs(x - 0.5) < 0.1)),
        "sd": float(x.std()),
    }
