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


bc = _load("band_cost_test", "band_cost.py")


def _WV(m, seed):
    rng = np.random.default_rng(seed)
    W = rng.random((m, m))
    V = rng.random((m, m)) * 0.3
    np.fill_diagonal(V, 0.0)
    return W, V


def test_chord_and_family_against_brute_force():
    rng = np.random.default_rng(1)
    dests = rng.uniform(-2000, 2000, (400, 2))
    F = bc.Family((100.0, -50.0), 20.0, dests)
    for _ in range(30):
        px, py = rng.uniform(-1500, 1500, 2)
        a, b = F.at(px, py, 50.0)
        hit, ch = 0, 0.0
        for x, y in dests:
            # brute force: sample the segment densely
            t = np.linspace(0, 1, 20001)
            qx, qy = 100.0 + t * (x - 100.0), -50.0 + t * (y + 50.0)
            inside = (qx - px) ** 2 + (qy - py) ** 2 < 2500.0
            hit += inside.any()
            ch += inside.mean() * math.hypot(x - 100.0, y + 50.0)
        assert abs(a - hit / 400) < 1e-12
        assert abs(b - ch / 400 / 20.0) < 2e-3 * max(1.0, b) + 1e-4


def test_point_on_every_segment():
    # every leg passes through p: a = 1, b = 2R / v (full chord)
    dests = [(1000.0 + 10 * k, 0.0) for k in range(50)]
    F = bc.Family((0.0, 0.0), 10.0, dests)
    a, b = F.at(500.0, 0.0, 50.0)
    assert a == 1.0 and abs(b - 100.0 / 10.0) < 1e-9


def test_score_counts_same_and_below():
    W, V = _WV(5, 2)
    lab = (0, 2, 1, 0, 2)
    s = sum(W[i, j] for i in range(5) for j in range(5) if lab[i] == lab[j])
    s += sum(V[i, j] for i in range(5) for j in range(5) if lab[j] < lab[i])
    assert abs(float(bc.score(W, V, lab)) - s) < 1e-12
    w, t = bc.parts(W, V, lab)
    assert abs(w + t - s) < 1e-12


def test_exhaustive_matches_brute_and_search_reaches_it():
    for seed in range(4):
        W, V = _WV(6, seed)
        brute = min(float(bc.score(W, V, l)) for l in itertools.product(range(3), repeat=6))
        lab, best = bc.exhaustive_bands(W, V, 3)
        assert abs(best - brute) < 1e-12
        lab2, best2 = bc.search_bands(W, V, 3, restarts=50, seed=seed)
        assert abs(best2 - brute) < 1e-9


def test_zero_transit_reduces_to_kway():
    kw = _load("split_kway_test_bc", "split_kway.py")
    W, _ = _WV(7, 5)
    V = np.zeros((7, 7))
    _, b1 = bc.exhaustive_bands(W, V, 3)
    _, b2 = kw.exhaustive(W[None], 3)
    assert abs(b1 - float(b2[0])) < 1e-12


def test_best_order_and_cut_cost():
    W, V = _WV(6, 7)
    lab, b, worst, res = bc.best_order(W, V, (0, 1, 1, 2, 0, 2))
    assert len(res) == 6 and b <= worst
    # symmetric V: the transit cost of a partition does not depend on the order
    Vs = V + V.T
    _, b, worst, _ = bc.best_order(W, Vs, (0, 1, 1, 2, 0, 2))
    assert abs(b - worst) < 1e-12


def test_transit_mc_matches_closed_form_small():
    rng = np.random.default_rng(3)
    mix = []
    hubs = [(0.0, 0.0), (1500.0, 300.0)]
    for j, (hx, hy) in enumerate(hubs):
        pts = rng.uniform(-2500, 2500, (60, 2)) + (hx, hy)
        mix += [(0.5 / 60, j, hx, hy, float(x), float(y)) for x, y in pts]
    T = bc.transit_terms(mix, [15.0, 20.0], 240.0)
    V = bc.V_of(T, 5.0)
    mc = bc.transit_mc(mix, [15.0, 20.0], 240.0, 5.0, n_flights=40000, seed=4)
    tot_cf, tot_mc = V[0, 1] + V[1, 0], mc[0, 1] + mc[1, 0]
    assert tot_cf > 0 and abs(tot_mc / tot_cf - 1) < 0.08
