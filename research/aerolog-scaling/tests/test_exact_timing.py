import importlib.util
import math
import os
import random

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("et_test", os.path.join(HERE, "exact_timing.py"))
et = importlib.util.module_from_spec(spec)
spec.loader.exec_module(et)


def brute(pa, va, Da, pb, vb, Db, R, n=4000):
    lo, hi = -Db, Da
    h = (hi - lo) / n
    return sum(et.closest(pa, va, Da, pb, vb, Db, lo + h * (k + 0.5))[2] < R * R for k in range(n)) * h, h


def test_offset_interval_matches_brute_force():
    rnd = random.Random(5)
    for trial in range(300):
        pa = (rnd.uniform(-300, 300), rnd.uniform(-300, 300))
        pb = (rnd.uniform(-300, 300), rnd.uniform(-300, 300))
        a = rnd.uniform(0, 2 * math.pi)
        va = (18 * math.cos(a), 18 * math.sin(a))
        b = rnd.uniform(0, 2 * math.pi)
        vb = va if trial % 4 == 0 else (13 * math.cos(b), 13 * math.sin(b))
        Da, Db = rnd.uniform(5, 40), rnd.uniform(5, 40)
        iv = et.offset_interval(pa, va, Da, pb, vb, Db, 50.0)
        L = 0.0 if iv is None else iv[1] - iv[0]
        Lb, h = brute(pa, va, Da, pb, vb, Db, 50.0)
        assert abs(L - Lb) <= 2 * h + 1e-9


def test_perpendicular_crossing_window():
    # long perpendicular legs crossing mid-way: window = 2 R |va - vb| / |va x vb|
    v = 20.0
    iv = et.offset_interval((-2000.0, 0.0), (v, 0.0), 200.0, (0.0, -2000.0), (0.0, v), 200.0, 50.0)
    assert abs((iv[1] - iv[0]) - 2 * 50.0 * math.hypot(v, v) / (v * v)) < 1e-9
    assert abs(0.5 * (iv[0] + iv[1])) < 1e-9


def test_far_apart_legs_never_conflict():
    assert et.offset_interval((0.0, 0.0), (20.0, 0.0), 50.0, (0.0, 500.0), (20.0, 0.0), 50.0, 50.0) is None


def test_matches_simulator_on_toy_mix():
    # two operators, a handful of destinations: the exact estimator and a long simulation agree on the en-route rate
    mix = []
    for j, (hx, hy) in enumerate(((0.0, 0.0), (1500.0, 300.0))):
        for (x, y) in ((2500.0, 900.0), (-1200.0, 2000.0), (800.0, -2600.0), (3000.0, -400.0)):
            mix.append((0.125, j, hx, hy, x, y))
    speeds = (15.0, 22.0)
    fn = lambda kind, vx, vy, h: et.gp.base_layer("semi", kind, vx, vy, h)
    cnt, hrs = et.gp.simulate_pairs(mix, speeds, 240, fn, n_flights=60000, seed=11)
    sim = sum(v for k, v in cnt.items() if k[2] == "enr")
    ex = et.exact_pairs(mix, speeds, 240, pairs=60000, seed=12)[0]
    rate = sum(v for k, v in ex.items() if k[2] == "enr")
    assert sim > 400
    assert abs(rate * hrs - sim) < 4 * math.sqrt(sim)
