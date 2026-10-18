"""Cutting-order planning: which markers to lay, and how many plies of each, to cut an order of
several sizes from the least cloth. The marker lengths come from `garment-markercost`'s nesting
code on stylised shirt pieces (not a real pattern); the planning problem is an integer program
solved exactly with HiGHS through `scipy.optimize.milp`."""
import itertools
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds


def combos(n_sizes, max_garments):
    """All size mixes (counts per size) with 1..max_garments garments."""
    out = []
    for c in itertools.product(range(max_garments + 1), repeat=n_sizes):
        if 1 <= sum(c) <= max_garments:
            out.append(c)
    return out


def plan(lengths, demand, max_plies=50, setup=0.0, allowed=None):
    """Minimise total cloth length (marker length x plies, cm of fabric, plus `setup` cm per marker
    used) so that every size's cut quantity reaches its demand (over-cutting is allowed, and paid
    for in cloth). `lengths` maps a count tuple to its marker length in cm. `allowed` optionally
    restricts the markers. Returns dict(cost, fabric, markers=[(combo, plies)], cut) or None."""
    keys = [k for k in lengths if allowed is None or allowed(k)]
    m, S = len(keys), len(demand)
    # variables: plies x_0..x_{m-1} (integer), use y_0..y_{m-1} (binary)
    c = np.concatenate([[lengths[k] for k in keys], [setup] * m])
    A = np.zeros((S, 2 * m))
    for j, k in enumerate(keys):
        for s in range(S):
            A[s, j] = k[s]
    link = np.zeros((m, 2 * m))
    for j in range(m):
        link[j, j], link[j, m + j] = 1, -max_plies
    cons = [LinearConstraint(A, lb=np.asarray(demand, float), ub=np.inf),
            LinearConstraint(link, lb=-np.inf, ub=0)]
    ub = np.concatenate([np.full(m, max_plies), np.ones(m)])
    res = milp(c, constraints=cons, integrality=np.ones(2 * m), bounds=Bounds(np.zeros(2 * m), ub))
    if not res.success:
        return None
    x = np.rint(res.x[:m]).astype(int)
    used = [(keys[j], int(x[j])) for j in range(m) if x[j] > 0]
    fabric = sum(lengths[k] * p for k, p in used)
    cut = [sum(k[s] * p for k, p in used) for s in range(S)]
    return dict(cost=fabric + setup * len(used), fabric=fabric, markers=used, cut=cut)


def pure(k):
    return sum(1 for v in k if v) == 1


def one_each(k):
    return sum(k) == 1


def full_set(k):
    return all(v == 1 for v in k)
