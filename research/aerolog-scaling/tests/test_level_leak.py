import importlib.util
import math
import os
import random

import pytest

np = pytest.importorskip("numpy")

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("level_leak_test", os.path.join(HERE, "level_leak.py"))
ll = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ll)
ff, ft = ll.ff, ll.ft


def _mix(rnd, hubs, radii, shares, n):
    out = []
    for j, ((hx, hy), r) in enumerate(zip(hubs, radii)):
        pts = []
        while len(pts) < n:
            x, y = rnd.uniform(-r, r), rnd.uniform(-r, r)
            if 0 < x * x + y * y <= r * r:
                pts.append((hx + x, hy + y))
        out += [(shares[j] / n, j, hx, hy, x, y) for x, y in pts]
    return out


def _close(a, b, tol=1e-9):
    for k in set(a) | set(b):
        x, y = a.get(k, 0.0), b.get(k, 0.0)
        assert abs(x - y) <= tol * max(1e-12, abs(y)), (k, x, y)


def _small():
    rnd = random.Random(8)
    hubs = [(0.0, 0.0), (900.0, -700.0), (-600.0, -200.0)]
    mix = _mix(rnd, hubs, [1800.0, 2200.0, 1000.0], [0.5, 0.3, 0.2], 30)
    return mix, {0: 18.0, 1: 22.0, 2: 15.0}


def test_other_level_flux_matches_brute_force():
    mix, speeds = _small()
    _close(ll.opp_flux_terms(mix, speeds, 240.0), ll.opp_brute(mix, speeds, 240.0))


def test_flipping_the_brute_force_back_gives_the_same_level_flux():
    # same-level (ft.brute) + other-level must equal the flux with every leg pair charged in both layer cases:
    # for a crossing pair that is w_same + w_opp, independent of the east bits
    mix, speeds = _small()
    same, opp = ft.brute(mix, speeds, 240.0), ll.opp_brute(mix, speeds, 240.0)
    flipped = [(w, j, hx, hy, 2 * hx - x, 2 * hy - y) for (w, j, hx, hy, x, y) in mix]   # reverse every leg
    same_f, opp_f = ft.brute(flipped, speeds, 240.0), ll.opp_brute(flipped, speeds, 240.0)
    tot = {k: same.get(k, 0) + opp.get(k, 0) for k in set(same) | set(opp)}
    tot_f = {k: same_f.get(k, 0) + opp_f.get(k, 0) for k in set(same_f) | set(opp_f)}
    # point reflection about each hub maps every pair's geometry to itself up to orientation: totals agree
    for k in tot:
        if k[0] == k[1]:
            assert abs(tot[k] - tot_f.get(k, 0.0)) <= 1e-9 * max(1e-12, tot[k])


def test_p_overlap_limits_and_symmetry():
    assert ll.p_overlap(0.0, 7.62, 0.0) == 1.0
    assert ll.p_overlap(10.0, 7.62, 0.0) == 0.0
    assert abs(ll.p_overlap(7.62, 7.62, 1.0) - 0.5) < 0.01          # gap = Z: about half
    for d in ("normal", "laplace"):
        assert abs(ll.p_overlap(5.0, 4.0, 1.5, d) - ll.p_overlap(-5.0, 4.0, 1.5, d)) < 1e-12
        ps = [ll.p_overlap(g, 4.0, 1.5, d) for g in (0, 2, 4, 6, 8, 12)]
        assert all(a >= b for a, b in zip(ps, ps[1:]))
    # Laplace has heavier far tails than the normal at the same sd
    assert ll.p_overlap(20.0, 4.0, 1.5, "laplace") > ll.p_overlap(20.0, 4.0, 1.5, "normal")


def test_level_weights_offsets():
    pw, px = ll.level_weights(10.0, 4.0, 0.0, 4)
    assert list(pw) == [1.0, 0.0, 0.0, 0.0]
    assert list(px) == [0.0, 0.0, 0.0, 0.0]
    pw, px = ll.level_weights(10.0, 12.0, 0.0, 3)   # one level reaches, two do not
    assert list(pw) == [1.0, 0.0, 0.0]
    assert list(px) == [1.0, 0.5, 0.0]


def _WXV(m, seed):
    rng = np.random.default_rng(seed)
    W, X, V = rng.random((m, m)), rng.random((m, m)) * 1.5, rng.random((m, m)) * 0.3
    np.fill_diagonal(V, 0.0)
    return W, X, V


def test_no_leak_reduces_to_band_cost_score():
    bc = ll._load("band_cost_level_test", "band_cost.py")
    W, X, V = _WXV(7, 1)
    pw, px = np.array([1.0, 0, 0, 0]), np.zeros(4)
    for lab in [(0, 1, 2, 3, 0, 1, 2), (3, 3, 0, 0, 1, 2, 1)]:
        assert abs(ll.score(W, X, V, lab, pw, px) - float(bc.score(W, V, lab))) < 1e-9


def test_search_matches_exhaustive_and_is_local_optimum():
    W, X, V = _WXV(7, 2)
    pw, px = ll.level_weights(6.0, 4.57, 1.0, 3)
    lab, f = ll.search(W, X, V, 3, pw, px, restarts=40)
    _, fe = ll.exhaustive(W, X, V, 3, pw, px)
    assert abs(f - fe) <= 1e-9 * fe
    for i in range(7):
        for a in range(3):
            l2 = list(lab)
            l2[i] = a
            assert ll.score(W, X, V, l2, pw, px) >= f - 1e-9


def test_parts_sum_to_score():
    W, X, V = _WXV(6, 3)
    pw, px = ll.level_weights(5.0, 4.57, 2.0, 4)
    lab = (0, 3, 1, 1, 2, 0)
    assert abs(sum(ll.parts(W, X, V, lab, pw, px)) - ll.score(W, X, V, lab, pw, px)) < 1e-9


def test_tau_conventions():
    assert abs(ll.tau_z(7.62) - 7.62 * (0.2 + 0.25)) < 1e-12
    assert abs(ll.tau_h(7.62) - 0.5 * 7.62 * 0.45) < 1e-12
