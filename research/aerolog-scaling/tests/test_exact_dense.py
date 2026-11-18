import importlib.util
import os
import random

import pytest

np = pytest.importorskip("numpy")

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("ed_test", os.path.join(HERE, "exact_dense.py"))
ed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ed)
et = ed.et


def _mix(rnd, hubs, radii, shares, n, grid=None):
    out = []
    for j, ((hx, hy), r) in enumerate(zip(hubs, radii)):
        pts = []
        while len(pts) < n:
            x, y = rnd.uniform(-r, r), rnd.uniform(-r, r)
            if grid:
                x, y = round(x / grid) * grid, round(y / grid) * grid
            if 0 < x * x + y * y <= r * r:
                pts.append((hx + x, hy + y))
        out += [(shares[j] / n, j, hx, hy, x, y) for x, y in pts]
    return out


def _close(a, b, tol=1e-9):
    for k in set(a) | set(b):
        x, y = a.get(k, 0.0), b.get(k, 0.0)
        assert abs(x - y) <= tol * max(1e-12, abs(y)) + 1e-14, (k, x, y)


def test_matches_brute_force_three_operators():
    rnd = random.Random(5)
    hubs = [(0.0, 0.0), (900.0, 200.0), (-300.0, 700.0)]
    mix = _mix(rnd, hubs, [1500.0, 1200.0, 1800.0], [0.5, 0.3, 0.2], 25)
    speeds = {0: 20.0, 1: 14.0, 2: 26.0}
    _close(ed.exact_terms(mix, speeds, 240.0, block=7)["all"], ed.brute(mix, speeds, 240.0))


def test_grid_destinations_axis_legs_and_shared_points():
    # 100 m grid: axis-aligned legs, collinear legs and destinations shared between operators and at other hubs
    rnd = random.Random(8)
    hubs = [(0.0, 0.0), (300.0, 0.0), (0.0, 400.0)]
    mix = _mix(rnd, hubs, [800.0, 700.0, 900.0], [0.4, 0.4, 0.2], 20, grid=100.0)
    speeds = {0: 15.0, 1: 15.0, 2: 22.0}
    _close(ed.exact_terms(mix, speeds, 240.0, block=5)["all"], ed.brute(mix, speeds, 240.0), tol=1e-8)


def test_block_size_invariant():
    rnd = random.Random(2)
    hubs = [(0.0, 0.0), (700.0, -500.0)]
    mix = _mix(rnd, hubs, [1500.0, 1300.0], [0.6, 0.4], 60)
    speeds = {0: 18.0, 1: 24.0}
    a = ed.exact_terms(mix, speeds, 240.0, block=3)["all"]
    b = ed.exact_terms(mix, speeds, 240.0, block=128)["all"]
    _close(a, b, tol=1e-11)


def test_vectorised_interval_matches_scalar():
    rnd = random.Random(11)
    for _ in range(3000):
        pa = (rnd.uniform(-300, 300), rnd.uniform(-300, 300))
        pb = (rnd.uniform(-300, 300), rnd.uniform(-300, 300))
        va = (rnd.uniform(-25, 25), rnd.uniform(-25, 25))
        vb = (rnd.uniform(-25, 25), rnd.uniform(-25, 25))
        Da, Db = rnd.uniform(1, 60), rnd.uniform(1, 60)
        iv = et.offset_interval(pa, va, Da, pb, vb, Db, 50.0)
        lo, hi, L = ed.intervals(np.array(pa[0] - pb[0]), np.array(pa[1] - pb[1]), va[0], va[1], Da,
                                 vb[0], vb[1], Db, 50.0)
        if iv is None:
            assert float(L) == 0.0
        else:
            assert abs(float(lo) - iv[0]) < 1e-9 and abs(float(hi) - iv[1]) < 1e-9


def test_sampled_exact_estimator_converges_to_dense_sum():
    rnd = random.Random(4)
    hubs = [(0.0, 0.0), (800.0, 300.0)]
    mix = _mix(rnd, hubs, [1200.0, 1000.0], [0.5, 0.5], 30)
    speeds = {0: 20.0, 1: 16.0}
    d = ed.exact_terms(mix, speeds, 240.0)["all"]
    tot_d = sum(d.values())
    bat = et.exact_pairs(mix, speeds, 240.0, pairs=200000, seed=1, batches=10)
    tots = [sum(b.values()) for b in bat]
    m = sum(tots) / len(tots)
    sd = (sum((t - m) ** 2 for t in tots) / 9) ** 0.5 / 10 ** 0.5
    assert abs(m - tot_d) < 4 * sd + 1e-9, (m, tot_d, sd)
