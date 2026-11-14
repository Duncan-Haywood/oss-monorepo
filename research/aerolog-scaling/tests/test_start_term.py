import importlib.util
import math
import os
import random

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("st_test", os.path.join(HERE, "start_term.py"))
st = importlib.util.module_from_spec(spec)
spec.loader.exec_module(st)
sb, et = st.sb, st.et


def _mix(rnd, hubs, radii, shares, n=120):
    out = []
    for j, ((hx, hy), r) in enumerate(zip(hubs, radii)):
        pts = []
        while len(pts) < n:
            x, y = rnd.uniform(-r, r), rnd.uniform(-r, r)
            if 0 < x * x + y * y <= r * r:
                pts.append((round(hx + x), round(hy + y)))
        out += [(shares[j] / n, j, hx, hy, x, y) for x, y in pts]
    return out


def test_layer_blindness():
    # for any start point and layer, exactly one leg of another flight is in that layer, with the full chord
    rnd = random.Random(3)
    for _ in range(300):
        hub = (rnd.uniform(-500, 500), rnd.uniform(-500, 500))
        dest = (rnd.uniform(-2000, 2000), rnd.uniform(-2000, 2000))
        fa = (1.0, 0, hub[0], hub[1], dest[0], dest[1])
        legs = et._legs(fa, {0: 17.0})
        x = (rnd.uniform(-2000, 2000), rnd.uniform(-2000, 2000))
        for layer in (0, 1):
            tot = sum(sb.chord(x, a[0], a[1], a[2], 50.0)[0] for a in legs if a[4] == layer)
            full = sb.chord(x, legs[0][0], legs[0][1], legs[0][2], 50.0)[0]
            assert abs(tot - full) < 1e-9


def test_window_matches_all_rows():
    rnd = random.Random(5)
    mix = _mix(rnd, [(0, 0)], [3000], [1.0], n=400)
    op = st.operators(mix, {0: 20.0})[0]
    for _ in range(200):
        x = (rnd.uniform(-3200, 3200), rnd.uniform(-3200, 3200))
        g = op.G(x, 50.0, 300.0)
        rows = op.rows
        brute = 0.0
        for _, d, w, ux, uy, _y in rows:
            seg = sb.chord(x, op.hub, (20.0 * ux, 20.0 * uy), d / 20.0, 50.0)[0]
            brute += w * seg
        assert abs(g[0] + g[1] - brute) < 1e-9
        # a point inside the R-disc of the hub sees every leg
    g0 = op.G((10.0, 0.0), 50.0, 0.0)
    assert g0[0] + g0[1] > 0


def test_analytic_start_matches_sampled_pairs():
    rnd = random.Random(7)
    hubs, radii, shares = [(0, 0), (900, 300), (-400, 800)], [1500, 1200, 1000], [0.5, 0.3, 0.2]
    mix = _mix(rnd, hubs, radii, shares, n=60)
    speeds = {0: 15.0, 1: 22.0, 2: 18.0}
    an = st.start_terms(mix, speeds, 240, R=50.0)
    smp = sb.estimate(mix, speeds, 240, R=50.0, pairs=150000, seed=1, batches=5)
    for z in ("term", "enr"):
        a = sum(x for k, x in an["start"].items() if k[2] == z)
        b = [sum(x for k, x in r["start"].items() if k[2] == z) for r in smp]
        m = sum(b) / len(b)
        sd = math.sqrt(sum((x - m) ** 2 for x in b) / (len(b) - 1)) / math.sqrt(len(b))
        assert abs(a - m) <= 4 * sd + 1e-3 * a, (z, a, m, sd)
    assert abs(an["hub"] + an["deliv"] - sum(an["start"].values())) < 1e-9
