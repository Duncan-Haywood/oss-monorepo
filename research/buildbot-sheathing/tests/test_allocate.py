"""Milestone 74: risk allocated per press by an exact dynamic programme, and a lower bound."""
from itertools import combinations

import numpy as np
import pytest

pytest.importorskip("scipy.stats")

from buildbot_sheathing import allocate as A  # noqa: E402
from buildbot_sheathing import drift as D  # noqa: E402


def small_wall(seed, period=4, sheets=3):
    rng = np.random.default_rng(seed)
    a_sheet = list(rng.choice([0.03, 0.06, 0.1], size=period))
    gaps = ([20.0] + [0.0] * (period - 1)) * sheets
    gaps[0] = 0.0
    return np.array(gaps), np.full(period * sheets, 2.0), np.array(a_sheet * sheets), period


def brute(g, t, a, rho, sig, kind, budget):
    M = len(t)
    for c in range(M):
        best = None
        for st in combinations(range(1, M), c):
            r = A.schedule_risk(g, t, a, list(st), rho, sig, kind)
            if r <= budget + 1e-12 and (best is None or r < best):
                best = r
        if best is not None:
            return c, best
    return None


@pytest.mark.parametrize("seed", range(6))
@pytest.mark.parametrize("kind", ["union", "lower"])
def test_dp_matches_brute_force(seed, kind):
    g, t, a, P = small_wall(seed)
    rho, sig = D.matched("MIX" if seed % 2 else "RW", 0.6)
    Q = A.risk_table(g, t, a, P, rho, sig)
    C = A.segment_risk(Q, kind)
    budget = [0.01, 0.05, 0.2][seed % 3]
    if kind == "lower":
        budget = -np.log1p(-budget)
    got = A.fewest(C, len(t), P, budget)
    want = brute(g, t, a, rho, sig, kind, budget)
    assert (got is None) == (want is None)
    if got is not None:
        assert got[0] == want[0]
        assert abs(got[2] - want[1]) < 1e-9
        assert abs(A.schedule_risk(g, t, a, got[1], rho, sig, kind) - got[2]) < 1e-9


def test_periodic_table_matches_direct():
    g, t, a, P = small_wall(3, sheets=4)
    rho, sig = D.matched("MIX", 0.1)
    assert A.check_periodic(g, t, a, P)
    Q = A.risk_table(g, t, a, P, rho, sig)
    for i in (0, 3, 7, 12):
        for m in (i, i + 2, len(t) - 1):
            E = t[i] + sum(g[j] + t[j] for j in range(i + 1, m + 1))
            assert abs(Q[i % P, m - i] - float(D.p_violate(E, a[m], rho, sig))) < 1e-12


def test_union_never_needs_more_than_a_uniform_level():
    """BONF (every press at alpha / N) is one feasible point of the union programme."""
    from buildbot_sheathing import rezero as R
    g, t, a, P = small_wall(1, period=6, sheets=8)
    rho, sig = D.matched("RW", 0.1)
    alpha = 0.01
    st = R.greedy(g, t, D.deadlines(a, rho, sig, alpha / len(a)))
    C = A.segment_risk(A.risk_table(g, t, a, P, rho, sig), "union")
    got = A.fewest(C, len(t), P, alpha)
    assert got[0] <= len(st)


def test_lower_never_exceeds_union():
    g, t, a, P = small_wall(2, period=6, sheets=8)
    rho, sig = D.matched("RW", 0.1)
    Q = A.risk_table(g, t, a, P, rho, sig)
    lo = A.fewest(A.segment_risk(Q, "lower"), len(t), P, -np.log1p(-0.01))
    up = A.fewest(A.segment_risk(Q, "union"), len(t), P, 0.01)
    assert lo[0] <= up[0]
