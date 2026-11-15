import importlib.util
import os
import random

import pytest

np = pytest.importorskip("numpy")

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("ff_test", os.path.join(HERE, "fast_flux.py"))
ff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ff)
ft = ff.ft


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


def _close(a, b, tol=1e-10):
    for k in set(a) | set(b):
        x, y = a.get(k, 0.0), b.get(k, 0.0)
        assert abs(x - y) <= tol * max(1e-12, abs(y)), (k, x, y)


def test_matches_dense_kernel_four_operators():
    rnd = random.Random(3)
    hubs = [(0.0, 0.0), (1200.0, 300.0), (-400.0, 900.0), (300.0, -1500.0)]
    mix = _mix(rnd, hubs, [2000.0, 1500.0, 2500.0, 1800.0], [0.4, 0.3, 0.2, 0.1], 120)
    speeds = {0: 20.0, 1: 14.0, 2: 26.0, 3: 18.0}
    _close(ff.flux_terms(mix, speeds, 240.0), ft.flux_terms(mix, speeds, 240.0))


def test_matches_brute_force_and_chunking_invariant():
    rnd = random.Random(8)
    hubs = [(0.0, 0.0), (900.0, -700.0), (-600.0, -200.0)]
    mix = _mix(rnd, hubs, [1800.0, 2200.0, 1000.0], [0.5, 0.3, 0.2], 30)
    speeds = {0: 18.0, 1: 22.0, 2: 15.0}
    ref = ft.brute(mix, speeds, 240.0)
    _close(ff.flux_terms(mix, speeds, 240.0, block=1), ref, 1e-9)
    _close(ff.flux_terms(mix, speeds, 240.0, block=5), ref, 1e-9)


def test_edges_axis_aligned_collinear_and_hub_on_leg():
    # legs through the other hub (A on segment b: a full-circle wedge), legs ending on the other operator's legs,
    # axis-aligned legs, and destinations shared by both operators
    hubs = [(0.0, 0.0), (500.0, 0.0)]
    pts = [(0.0, 800.0), (0.0, -800.0), (250.0, 600.0), (250.0, -600.0), (900.0, 0.0), (-300.0, 0.0),
           (500.0, 700.0), (250.0, 0.0), (-500.0, 0.0), (1000.0, 0.0), (500.0, -500.0), (0.0, 500.0)]
    mix = [(1 / 12 * s, j, h[0], h[1], x, y) for j, (h, s) in enumerate(zip(hubs, (0.7, 0.3))) for x, y in pts
           if (x, y) != h]
    speeds = {0: 20.0, 1: 15.0}
    _close(ff.flux_terms(mix, speeds, 240.0), ft.brute(mix, speeds, 240.0), 1e-9)


def test_wedge_never_drops_a_crossing_pair():
    rnd = random.Random(21)
    hubs = [(0.0, 0.0), (-700.0, 450.0)]
    mix = _mix(rnd, hubs, [1500.0, 2600.0], [0.5, 0.5], 200)
    ops = ft.operators(mix, {0: 20.0, 1: 20.0})
    A, B = ops[0], ops[1]
    order, i0, cnt = ff.wedges(A, B)
    qx, qy = B.hub[0] - A.hub[0], B.hub[1] - A.hub[1]
    for k in range(B.n):
        cand = set(order[(i0[k] + np.arange(cnt[k])) % A.n].tolist())
        for j in range(A.n):
            den = A.dx[j] * B.dy[k] - A.dy[j] * B.dx[k]
            if den == 0:
                continue
            t = (qx * B.dy[k] - qy * B.dx[k]) / den
            u = (qx * A.dy[j] - qy * A.dx[j]) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                assert j in cand, (j, k)
    st = {}
    ff.cross_sum(A, B, stats=st)
    assert st["crossed"] <= st["tested"] < st["pairs"]


def test_leg_ending_at_the_other_hub():
    # 11y's first kernel dropped every crossing of a leg whose destination is the other operator's hub
    # (its wedge seen from that hub is undefined: atan2(0, 0)); found on layout 0, 12,588 pairs
    rnd = random.Random(4)
    hubs = [(-940.0, -2710.0), (1040.0, -2060.0)]
    mix = _mix(rnd, hubs, [2500.0, 3000.0], [0.5, 0.5], 60)
    mix.append((0.01, 1, 1040.0, -2060.0, -940.0, -2710.0))     # operator 1 flies to operator 0's hub
    mix.append((0.01, 0, -940.0, -2710.0, 1040.0, -2060.0))     # and the reverse
    speeds = {0: 20.0, 1: 16.0}
    _close(ff.flux_terms(mix, speeds, 240.0, block=4), ft.flux_terms(mix, speeds, 240.0))


def test_symmetric_same_operator_sum():
    rnd = random.Random(9)
    hubs = [(0.0, 0.0), (800.0, 500.0)]
    mix = _mix(rnd, hubs, [2000.0, 1200.0], [0.7, 0.3], 150)
    mix.append((0.01, 0, 0.0, 0.0, 0.0, 700.0))          # dx == 0: east bit from dy
    mix.append((0.01, 0, 0.0, 0.0, 0.0, -700.0))
    speeds = {0: 20.0, 1: 15.0}
    _close(ff.flux_terms(mix, speeds, 240.0, sym_same=True), ft.flux_terms(mix, speeds, 240.0))
    _close(ff.flux_terms(mix, speeds, 240.0, sym_same=True), ft.brute(mix, speeds, 240.0), 1e-9)
