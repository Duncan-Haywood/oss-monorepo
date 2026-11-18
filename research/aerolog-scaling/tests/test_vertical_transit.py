import importlib.util
import itertools
import math
import os

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


vt = _load("vertical_transit_test", "vertical_transit.py")


def _mix(m, n, seed):
    rnd = np.random.default_rng(seed)
    mix = []
    hubs = rnd.uniform(-2000, 2000, (m, 2))
    shares = rnd.dirichlet(np.ones(m))
    for j in range(m):
        d = hubs[j] + rnd.normal(0, 1500, (n, 2))
        for x, y in d:
            mix.append((shares[j] / n, j, hubs[j][0], hubs[j][1], float(x), float(y)))
    return mix, list(rnd.uniform(12, 28, m)), list(shares), hubs


def test_wedge_point_sums_match_brute_force():
    mix, speeds, _, hubs = _mix(3, 400, 1)
    ops = vt.operators(mix, speeds)
    rnd = np.random.default_rng(2)
    q = np.vstack([rnd.uniform(-4000, 4000, (300, 2)), hubs, hubs + 30.0, [p[4:6] for p in mix[:200]]])
    for j, S in ops.items():
        N, K = vt.point_sums(S, q[:, 0], q[:, 1], 50.0, chunk=997)
        Nb, Kb = vt.point_sums_brute(S, q[:, 0], q[:, 1], 50.0)
        assert np.allclose(N, Nb, rtol=1e-12, atol=1e-15)
        assert np.allclose(K, Kb, rtol=1e-12, atol=1e-15)
        assert N.max() > 0


def test_chord_of_a_segment_through_the_disc_centre_is_its_diameter():
    S = vt.Seg((0.0, 0.0), 10.0, [(1.0, 1000.0, 0.0)])
    N, K = vt.point_sums(S, [500.0, 500.0, 20.0, 1000.0], [0.0, 30.0, 0.0, 0.0], 50.0)
    assert np.allclose(N, [1, 1, 1, 1])
    assert np.allclose(K * 10.0, [100.0, 80.0, 70.0, 50.0])


def test_overlap_rate_matches_poisson_simulation():
    """Expected (transit, cruiser) overlaps per unit time = l1 l2 (tau + chord / v) for independent Poisson streams."""
    rnd = np.random.default_rng(3)
    l1, l2, tau, v, chord, T = 0.05, 0.08, 3.0, 10.0, 60.0, 200000.0
    d = chord / v
    hits = 0
    reps = 5
    for _ in range(reps):
        a = np.sort(rnd.uniform(0, T, rnd.poisson(l1 * T)))        # transit start: in the band for [a, a + tau]
        b = np.sort(rnd.uniform(0, T, rnd.poisson(l2 * T)))        # cruiser in the disc for [b, b + d]
        # overlap iff b - tau < a < b + d, i.e. a - d < b < a + tau
        hits += int((np.searchsorted(b, a + tau) - np.searchsorted(b, a - d)).sum())
    rate = hits / (reps * T)
    expect = l1 * l2 * (tau + d)
    assert abs(rate / expect - 1) < 0.03


def test_total_matches_explicit_loop():
    rnd = np.random.default_rng(4)
    m = 6
    W, c = rnd.random((m, m)), rnd.random((m, m)) * 0.1
    for _ in range(20):
        pos = tuple(rnd.integers(0, 3, m))
        t = 0.0
        for i in range(m):
            for j in range(m):
                if pos[i] == pos[j]:
                    t += W[i, j] + c[i, j]
                elif pos[j] < pos[i]:
                    t += 4 * c[i, j]
        assert math.isclose(vt.total(W, c, pos), t, rel_tol=1e-12)
    # one group: W + c everywhere
    assert math.isclose(vt.total(W, c, (0,) * m), float((W + c).sum()), rel_tol=1e-12)


def test_local_search_and_exhaustive_agree_with_brute_force():
    rnd = np.random.default_rng(5)
    m = 7
    for s in range(4):
        W = rnd.random((m, m)) * (rnd.random((m, m)) < 0.7)
        c = rnd.random((m, m)) * 0.05 * (s + 1)
        for k in (2, 3):
            brute = min(vt.total(W, c, p) for p in itertools.product(range(k), repeat=m))
            _, ex = vt.exhaustive_T(W, c, k, chunk=500)
            pos, ls = vt.local_search_T(W, c, k, restarts=60, seed=s)
            assert math.isclose(ex, brute, rel_tol=1e-12)
            assert math.isclose(ls, brute, rel_tol=1e-9)
            assert max(pos) < k


def test_descent_is_a_local_optimum():
    rnd = np.random.default_rng(6)
    m, k = 8, 4
    W, c = rnd.random((m, m)), rnd.random((m, m)) * 0.2
    pos = vt.descend_T(W, c, rnd.integers(0, k, m), k)
    t = vt.total(W, c, pos)
    for i in range(m):
        for h in range(k):
            q = list(pos)
            q[i] = h
            assert vt.total(W, c, q) >= t - 1e-12


def test_orders_finds_best_and_worst_stacking():
    rnd = np.random.default_rng(7)
    m = 6
    W, c = rnd.random((m, m)), rnd.random((m, m))
    labels = (0, 0, 1, 2, 1, 2)
    pos, best, worst = vt.orders(labels, W, c)
    vals = []
    for perm in itertools.permutations(range(3)):
        vals.append(vt.total(W, c, [perm[x] for x in labels]))
    assert math.isclose(best, min(vals)) and math.isclose(worst, max(vals))
    assert vt.same_grouping(pos, labels) and vt.used(pos) == 3


def test_transit_terms_scale_and_split():
    mix, speeds, shares, _ = _mix(3, 150, 8)
    tt = vt.transit_terms(mix, speeds, shares, 240.0)
    c = vt.c_matrix(tt, 3.0)
    assert np.allclose(c, vt.c_matrix(tt, 3.0, "hub") + vt.c_matrix(tt, 3.0, "dest"))
    assert (c >= 0).all() and np.trace(c) > 0
    # the own-hub term: every own segment passes the own hub with chord min(L, R)
    ops = vt.operators(mix, speeds)
    lam = 240.0 / 3600.0
    for i in range(3):
        S = ops[i]
        exp = 3600 * lam ** 2 * shares[i] * (3.0 * S.w.sum() + (S.w * np.minimum(S.L, 50.0)).sum() / S.v)
        assert math.isclose(vt.c_matrix(tt, 3.0, "hub")[i, i], exp, rel_tol=1e-9)
