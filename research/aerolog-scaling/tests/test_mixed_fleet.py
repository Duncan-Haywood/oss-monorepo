import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_mixed", _d / "mixed_fleet.py")
mf = importlib.util.module_from_spec(_s)
_s.loader.exec_module(mf)


def _cross_mix(theta_deg):
    # operator 0 flies east from (0, 0) to (3000, 0); operator 1's line crosses it at (1500, 0) at angle theta
    th = math.radians(theta_deg)
    ux, uy = math.cos(th), math.sin(th)
    hb = (1500 - 1500 * ux, -1500 * uy)
    return [(1.0, 0, 0.0, 0.0, 3000.0, 0.0), (1.0, 1, hb[0], hb[1], 1500 + 1500 * ux, 1500 * uy)]


def test_window_reduces_to_equal_speed_form():
    for th in (0.3, 1.0, 2.0):
        a, b = (20.0, 0.0), (20 * math.cos(th), 20 * math.sin(th))
        assert abs(mf.window(a, b, 50, 1e9) - 2 * 50 / (20 * math.cos(th / 2))) < 1e-9


def test_window_unequal_speeds_right_angle():
    # perpendicular legs at 10 and 30 m/s: miss distance |Delta| * 300 / sqrt(1000)
    w = mf.window((10.0, 0.0), (0.0, 30.0), 50, 1e9)
    assert abs(w - 2 * 50 * math.sqrt(1000) / 300) < 1e-9


def test_unequal_speed_crossing_matches_simulator():
    for theta in (45, 90, 135):
        mix = _cross_mix(theta)
        sp = (12.0, 28.0)
        s, _ = mf.simulate(mix, sp, 120, n_flights=40000, seed=theta)
        c = mf.closed_form(mix, sp, 120, pairs=20000)
        assert abs(s[("cross", "enr")] / c[("cross", "enr")] - 1) < 0.08, theta


def test_shares_weight_operators():
    pts = [(100.0 * k, 50.0) for k in range(1, 30)]
    mix = mf.mix_operators(pts, [(0.0, 0.0), (1000.0, 0.0)], (0.8, 0.2))
    w0 = sum(m[0] for m in mix if m[1] == 0)
    w1 = sum(m[0] for m in mix if m[1] == 1)
    assert abs(w0 - 0.8) < 1e-12 and abs(w1 - 0.2) < 1e-12
