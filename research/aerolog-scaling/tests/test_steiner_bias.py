import importlib.util
import math
import os
import random

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("sb_test", os.path.join(HERE, "steiner_bias.py"))
sb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sb)
et, gp = sb.et, sb.gp


def _start_brute(pa, va, Da, pb, vb, Db, R, n=20000):
    """Offsets u at which the later leg starts within R of the other leg's position."""
    lo, hi = -Db, Da
    h = (hi - lo) / n
    m = 0
    for k in range(n):
        u = lo + h * (k + 0.5)
        if u >= 0:   # b starts at time u; a at pa + va u
            d = math.hypot(pa[0] + va[0] * u - pb[0], pa[1] + va[1] * u - pb[1])
        else:        # a starts at time 0 = b's time -u
            d = math.hypot(pb[0] + vb[0] * -u - pa[0], pb[1] + vb[1] * -u - pa[1])
        m += d < R
    return m * h, h


def _leg(p, v, D, hub=(0.0, 0.0)):
    return (p, v, D, hub, 0)


def test_start_chords_match_brute_force_and_bound_the_interval():
    rnd = random.Random(11)
    for _ in range(150):
        pa = (rnd.uniform(-200, 200), rnd.uniform(-200, 200))
        pb = (rnd.uniform(-200, 200), rnd.uniform(-200, 200))
        a, b = rnd.uniform(0, 2 * math.pi), rnd.uniform(0, 2 * math.pi)
        va, vb = (16 * math.cos(a), 16 * math.sin(a)), (22 * math.cos(b), 22 * math.sin(b))
        Da, Db = rnd.uniform(3, 30), rnd.uniform(3, 30)
        st, se = sb.start_parts(_leg(pa, va, Da), _leg(pb, vb, Db), 50.0)
        Lb, h = _start_brute(pa, va, Da, pb, vb, Db, 50.0)
        assert abs(st + se - Lb) <= 2 * h + 1e-9
        iv = et.offset_interval(pa, va, Da, pb, vb, Db, 50.0)
        L = 0.0 if iv is None else iv[1] - iv[0]
        assert st + se <= L + 1e-6          # start episodes are a subset of all conflicting offsets


def test_translation_identity_steiner():
    # integral over b's start position of |U| = 2 R |w| Da Db + pi R^2 (Da + Db); start chords give the pi R^2 part
    R = 50.0
    va, vb = (18.0, 0.0), (6.0, 15.0)
    Da, Db = 40.0, 30.0
    w = math.hypot(va[0] - vb[0], va[1] - vb[1])
    g, lo, hi = 0.0, -700.0, 1500.0
    n = 220
    step = (hi - lo) / n
    tot = start = 0.0
    for i in range(n):
        for j in range(n):
            pb = (lo + step * (i + 0.5), lo + step * (j + 0.5))
            iv = et.offset_interval((0.0, 0.0), va, Da, pb, vb, Db, R)
            if iv:
                tot += iv[1] - iv[0]
            st, se = sb.start_parts(_leg((0.0, 0.0), va, Da), _leg(pb, vb, Db), R)
            start += st + se
    tot *= step * step
    start *= step * step
    want_start = math.pi * R * R * (Da + Db)
    want = 2 * R * w * Da * Db + want_start
    assert abs(tot / want - 1) < 0.01
    assert abs(start / want_start - 1) < 0.02


def test_cf_pair_reproduces_closed_form():
    rnd = random.Random(3)
    hubs = [(0.0, 0.0), (2500.0, 800.0), (-1200.0, 2000.0)]
    mix = []
    for h, (hx, hy) in enumerate(hubs):
        for _ in range(40):
            mix.append((rnd.random(), h, hx, hy, hx + rnd.uniform(-4000, 4000), hy + rnd.uniform(-4000, 4000)))
    speeds = (14.0, 20.0, 26.0)
    want = gp.closed_form_pairs(mix, speeds, 240, "semi", pairs=3000, seed=9)
    got = sb.estimate(mix, speeds, 240, pairs=3000, seed=9)[0]["cf"]
    for k in set(want) | set(got):
        assert abs(want.get(k, 0.0) - got.get(k, 0.0)) < 1e-9 * max(1.0, abs(want.get(k, 0.0)))
