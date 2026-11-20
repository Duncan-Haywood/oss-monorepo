"""Milestone 62 shared core: the planner's own limit over every hold-side combination (the exact envelope gate).

L_any(key, phi) is the largest drag H (N) at direction phi for which some hold-side combination of the pose has a force
plan (``m55.plan_forces`` under ``m55.with_sides``; 2^6 = 64 combinations on the G1, 2^4 = 16 on the H1). A union of
downward-closed sets is downward closed, so if each combination's feasibility is monotone in H, one bisection on
"any combination plans" is exact to its tolerance. The search runs on [L_p, balance limit]: L_p (pose sides) is a
lower bound by construction, and the balance-and-cones LP (milestone 50) is a relaxation of the hold QP, so its
limit is an upper bound where it binds (``ok_any`` at the balance limit plus 0.5 N is also reported, for limits below
the 60 N search cap, to check that; at the cap the balance limit is the cap, not a bound).
Imported by probe.py and run.py.
"""
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m60_jointpreload"))
import core as C  # noqa: E402

E59, E55, M1 = C.E59, C.E55, C.M1
TOL = 0.01                                       # N, bisection tolerance of L_any
HMAX = 60.0                                      # N, the balance limit's search cap (milestone 54)


def combos(key):
    """The pose's own sides first, then every other combination."""
    s0 = tuple(float(x) for x in E59.E53.sides(key))
    allc = list(itertools.product((-1.0, 1.0), repeat=len(s0)))
    return [s0] + [c for c in allc if c != s0]


def ok_any(key, H, phi, order):
    """Index into ``order`` of the first combination with a force plan at (H, phi), or None. ``order`` is reordered
    so the last winner is tried first."""
    f = np.asarray(M1.hose_f(key, H, phi), float)
    for i, c in enumerate(order):
        if E55.with_sides(key, np.array(c), lambda: E55.plan_forces(key, f) is not None):
            if i:
                order.insert(0, order.pop(i))
            return c
    return None


def lany(key, phi, lp, lim):
    """(L_any, winning combination at L_any, ok_any at lim + 0.5 N or None at the cap, evaluations). None when lim is None."""
    if lim is None:
        return None
    order = combos(key)
    ev = [0]

    def ok(H):
        ev[0] += 1
        return ok_any(key, H, phi, order)
    above = None if lim >= HMAX - 1e-9 else ok(lim + 0.5) is not None
    w = ok(lim)
    if w is not None:
        return {"L": lim, "c": list(w), "above": above, "ev": ev[0]}
    a = 0.0 if lp is None else lp
    w = ok(a)
    if w is None:
        return {"L": None, "c": None, "above": above, "ev": ev[0]}
    b = lim
    while b - a > TOL:
        m = (a + b) / 2
        x = ok(m)
        if x is not None:
            a, w = m, x
        else:
            b = m
    return {"L": a, "c": list(w), "above": above, "ev": ev[0]}
