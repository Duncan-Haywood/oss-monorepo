import importlib.util
import os
import random

import pytest

np = pytest.importorskip("numpy")

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("ft_test", os.path.join(HERE, "flux_term.py"))
ft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ft)


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
    keys = set(a) | set(b)
    for k in keys:
        x, y = a.get(k, 0.0), b.get(k, 0.0)
        assert abs(x - y) <= tol * max(1.0, abs(y)), (k, x, y)


def test_matches_brute_force_three_operators():
    rnd = random.Random(11)
    hubs = [(0.0, 0.0), (1200.0, 300.0), (-400.0, 900.0)]
    mix = _mix(rnd, hubs, [2000.0, 1500.0, 2500.0], [0.5, 0.3, 0.2], 25)
    speeds = {0: 20.0, 1: 14.0, 2: 26.0}
    _close(ft.flux_terms(mix, speeds, 240.0, R=50.0, block=7), ft.brute(mix, speeds, 240.0, R=50.0))


def test_block_size_does_not_matter():
    rnd = random.Random(5)
    hubs = [(0.0, 0.0), (900.0, -700.0)]
    mix = _mix(rnd, hubs, [1800.0, 2200.0], [0.6, 0.4], 40)
    speeds = {0: 18.0, 1: 22.0}
    _close(ft.flux_terms(mix, speeds, 240.0, block=3), ft.flux_terms(mix, speeds, 240.0, block=1000), 1e-12)


def test_axis_aligned_and_shared_points():
    # destinations on the axes (dx == 0 east-bit edge case) and served by both operators
    hubs = [(0.0, 0.0), (500.0, 0.0)]
    pts = [(0.0, 800.0), (0.0, -800.0), (250.0, 600.0), (250.0, -600.0), (900.0, 0.0), (-300.0, 0.0), (500.0, 700.0)]
    mix = [(1 / 7 * s, j, h[0], h[1], x, y) for j, (h, s) in enumerate(zip(hubs, (0.7, 0.3))) for x, y in pts
           if (x, y) != h]
    speeds = {0: 20.0, 1: 15.0}
    _close(ft.flux_terms(mix, speeds, 240.0, block=2), ft.brute(mix, speeds, 240.0))


def test_matches_sampled_closed_form():
    # the sampled estimator converges to the deterministic sum (loose: Monte Carlo)
    rnd = random.Random(2)
    hubs = [(0.0, 0.0), (700.0, 400.0)]
    mix = _mix(rnd, hubs, [1500.0, 1500.0], [0.5, 0.5], 30)
    speeds = {0: 20.0, 1: 20.0}
    det = ft.flux_terms(mix, speeds, 240.0)
    smp = ft.gp.closed_form_pairs(mix, speeds, 240.0, "semi", R=50.0, pairs=200000, seed=1)
    tot = lambda w: sum(x for (i, j, z), x in w.items() if i != j)
    assert abs(tot(smp) / tot(det) - 1) < 0.03
