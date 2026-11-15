import importlib.util
import math
import os
import random

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gs = _load("gs_test", "grid_start.py")
st = _load("gs_test_st", "start_term.py")


def _mix(rnd, hubs, radii, shares, n):
    out = []
    for j, ((hx, hy), r) in enumerate(zip(hubs, radii)):
        k = 0
        while k < n:
            x, y = rnd.uniform(-r, r), rnd.uniform(-r, r)
            if 0 < x * x + y * y <= r * r:
                out.append((shares[j] / n, j, hx, hy, hx + x, hy + y))
                k += 1
    return out


HUBS, RADII, SHARES = [(0.0, 0.0), (1700.0, 600.0), (-900.0, 1500.0)], [2500.0, 2200.0, 2000.0], [0.5, 0.3, 0.2]
SPEEDS = [15.0, 22.0, 18.0]


def test_uniform_mass_sums_to_share():
    o = (-3000.0, -3000.0)
    m = gs.uniform_mass((0.0, 0.0), 1500.0, o, 0.3)
    assert abs(sum(x for _, x in m) - 0.3) < 1e-12
    assert all(math.hypot(*p) < 1500.0 for p, _ in m)


def test_grid_start_matches_exact_on_dense_destinations():
    # with many smoothly spread destinations, the small-R grid form approaches 11t's exact start term
    rnd = random.Random(11)
    mix = _mix(rnd, HUBS, RADII, SHARES, 3000)
    ex = st.start_terms(mix, dict(enumerate(SPEEDS)), 240, R=50.0)
    g, _ = gs.start_g(mix, HUBS, RADII, SPEEDS, SHARES)
    a, b = sum(ex["start"].values()), sum(g["start"].values())
    assert abs(b / a - 1) < 0.08, b / a
    assert abs(g["hub"] + g["deliv"] - b) < 1e-9


def test_uniform_start_matches_dense_uniform_list():
    # start_u (no list) agrees with start_g on a list drawn uniformly from the same discs
    rnd = random.Random(13)
    mix = _mix(rnd, HUBS, RADII, SHARES, 4000)
    g, _ = gs.start_g(mix, HUBS, RADII, SPEEDS, SHARES)
    u, _ = gs.start_u(HUBS, RADII, SPEEDS, SHARES)
    a, b = sum(g["start"].values()), sum(u["start"].values())
    assert abs(b / a - 1) < 0.08, b / a


def test_start_scales_as_r_squared():
    u50, _ = gs.start_u(HUBS, RADII, SPEEDS, SHARES, R=50.0)
    u100, _ = gs.start_u(HUBS, RADII, SPEEDS, SHARES, R=100.0)
    assert abs(sum(u100["start"].values()) / sum(u50["start"].values()) - 4.0) < 1e-9


def test_plus_adds_only_enroute():
    w = gs.plus({(0, 1, "enr"): 1.0}, {(0, 1, "enr"): 0.5, (0, 1, "term"): 2.0, (1, 2, "enr"): 0.25})
    assert w == {(0, 1, "enr"): 1.5, (1, 2, "enr"): 0.25}
