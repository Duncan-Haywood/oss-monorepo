"""Contact that changes tolerance, and moderate voices read as the other side's.

civ-levers' bridging lever moves ties only; positions change, tolerance does not. Here each
agent has its own latitude of acceptance ``eps_i`` and cross-camp contact edits it, a stand-in
for Pettigrew and Tropp (2006)'s finding that intergroup contact lowers prejudice:

* an *accepted* cross-camp meeting (distance < eps_i) raises eps_i by ``gain`` (cap ``eps_max``);
* a *rejected* one (distance > tau, repulsion) lowers eps_i by ``loss`` (floor ``eps_min``).

``exposure=True`` widens on any cross-camp meeting that is not repelled (mere exposure,
even when the other's view is out of reach), not only an accepted one.

``identity`` is the chance that an agent reads a committed voice as the other camp's and
dismisses it (no attraction), applied to fixed agents only.
"""
from __future__ import annotations

import numpy as np

from .model import measures, rewire_bridges, polarized_society


def step_contact(soc, rng, eps, tau, mu, gain, loss, eps_max, eps_min, identity=0.0, exposure=False):
    n, x = soc.n, soc.x
    deg = soc.degree
    pick = soc.indptr[:-1] + (rng.random(n) * np.maximum(deg, 1)).astype(np.int64)
    pick = np.minimum(pick, len(soc.indices) - 1)
    j = soc.indices[pick]
    has = deg > 0
    partner = np.where(has, x[j], x)
    d = partner - x
    ad = np.abs(d)
    accept = ad < eps
    reject = ad > tau
    if identity > 0:
        dismiss = soc.fixed[j] & (rng.random(n) < identity)
        accept = accept & ~dismiss
    cross = has & (soc.group[j] != soc.group)
    move = np.where(accept, mu * d, np.where(reject, -mu * d, 0.0))
    move[soc.fixed] = 0.0
    grew = cross & ~reject if exposure else cross & accept
    de = np.where(grew, gain, 0.0) - np.where(cross & reject, loss, 0.0)
    de[soc.fixed] = 0.0
    np.clip(x + move, 0.0, 1.0, out=x)
    np.clip(eps + de, eps_min, eps_max, out=eps)


def outcome_contact(dose, eps0, tau, gain, loss=0.0, seed=0, sweeps=400, mu=0.3,
                    eps_max=0.5, eps_min=0.05, identity=0.0, lever="bridge", exposure=False):
    """Bridging at ``dose`` (0 = none), tolerance evolving by contact; also returns mean eps."""
    soc = polarized_society(seed=seed)
    rng = np.random.default_rng(seed + 10_007)
    if lever == "bridge" and dose > 0:
        soc = rewire_bridges(soc, dose, seed)
    elif lever == "moderates":
        z = rng.choice(soc.n, int(round(dose * soc.n)), replace=False)
        soc.x[z], soc.fixed[z] = 0.5, True
    eps = np.full(soc.n, eps0, float)
    rng = np.random.default_rng(seed)
    for _ in range(sweeps):
        step_contact(soc, rng, eps, tau, mu, gain, loss, eps_max, eps_min, identity, exposure)
    m = measures(soc)
    m["eps_mean"] = float(eps[~soc.fixed].mean())
    return m
