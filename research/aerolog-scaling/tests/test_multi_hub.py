import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_multi", _d / "multi_hub.py")
mh = importlib.util.module_from_spec(_s)
_s.loader.exec_module(mh)


def _cross_mix(theta_deg):
    # operator 0 flies east from (0, 0) to (3000, 0); operator 1's line crosses it at (1500, 0) at angle theta
    th = math.radians(theta_deg)
    ux, uy = math.cos(th), math.sin(th)
    hb = (1500 - 1500 * ux, -1500 * uy)
    return [(1.0, 0, 0.0, 0.0, 3000.0, 0.0), (1.0, 1, hb[0], hb[1], 1500 + 1500 * ux, 1500 * uy)]


def test_crossing_window_matches_simulator():
    for theta in (60, 90, 135):
        mix = _cross_mix(theta)
        s, _, _ = mh.simulate(mix, 120, n_flights=40000, seed=theta)
        c = mh.closed_form(mix, 120, pairs=20000)
        assert abs(s[("cross", "enr")] / c[("cross", "enr")] - 1) < 0.08, theta


def test_crossing_window_formula_right_angle():
    # theta = 90: oo and ii windows 2R/(v cos 45), oi window 2R/(v sin 45); pairs of distinct ops have prob 1/2
    mix = _cross_mix(90)
    c = mh.closed_form(mix, 3600.0, v=10.0, R=10.0, pairs=40000, seed=1)
    w = 2 * 10 / (10 * math.cos(math.pi / 4))
    expect = 3600.0 * 0.5 * (0.5 * w * 2 + w)   # per hour, Lambda = 1/s
    assert abs(c[("cross", "enr")] / expect - 1) < 0.03


def test_voronoi_assignment_has_no_crossings():
    pts = [(math.cos(a) * r, math.sin(a) * r) for a in [k * 0.37 for k in range(200)] for r in (500.0, 2500.0)]
    mix = mh.mix_one_operator(pts, [(-1000.0, 0.0), (1000.0, 0.0)])
    c = mh.closed_form(mix, 60, pairs=20000)
    assert c[("cross", "enr")] == 0.0 and c[("cross", "term")] == 0.0


def test_layer_rules():
    assert mh.layer("single", "o", 1, 0) == mh.layer("single", "i", -1, 0) == 0
    assert mh.layer("inout", "o", -1, 0) == 0 and mh.layer("inout", "i", 1, 0) == 1
    assert mh.layer("semi", "o", 1, 0) == 0 and mh.layer("semi", "i", -1, 0) == 1
    assert len({mh.layer("semi_inout", k, vx, 0) for k in "oi" for vx in (1, -1)}) == 4
