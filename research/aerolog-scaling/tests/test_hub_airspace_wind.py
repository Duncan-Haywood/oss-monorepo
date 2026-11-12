import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_wind", _d / "wind.py")
wind = importlib.util.module_from_spec(_s)
_s.loader.exec_module(wind)
_r = importlib.util.spec_from_file_location("hub_airspace_run_w", _d / "run.py")
run = importlib.util.module_from_spec(_r)
_r.loader.exec_module(run)


def _ring(n, d=3000.0):
    return [(d * math.cos(2 * math.pi * k / n), d * math.sin(2 * math.pi * k / n)) for k in range(n)]


def test_ground_speed_head_tail_and_cross():
    assert math.isclose(wind.ground_speed(1, 0, 20.0, 5.0, 0.0), 25.0)
    assert math.isclose(wind.ground_speed(-1, 0, 20.0, 5.0, 0.0), 15.0)
    assert math.isclose(wind.ground_speed(0, 1, 20.0, 5.0, 0.0), math.sqrt(375.0))
    assert wind.ground_speed(0, 1, 20.0, 25.0, 0.0) is None


def test_harmonic_mean_identity():
    # out and in ground speeds on one track multiply to v^2 - W^2 at any wind angle
    v, W = 20.0, 7.0
    for k in range(12):
        a = 2 * math.pi * k / 12
        wx, wy = W * math.cos(a), W * math.sin(a)
        g = wind.ground_speed(1, 0, v, wx, wy)
        h = wind.ground_speed(-1, 0, v, wx, wy)
        assert math.isclose(g * h, v * v - W * W, rel_tol=1e-12)


def test_still_air_closed_form_equals_11a():
    dests = run.load_nyc()
    a = wind.closed_form(dests, 60, pairs=50000, seed=9)
    b = run.closed_form(dests, 60, pairs=50000, seed=9)
    assert math.isclose(a["rates"]["io"][1], b["io_out"] * 3600, rel_tol=1e-9)
    assert math.isclose(a["rates"]["io"][0], b["io_all"] * 3600, rel_tol=1e-9)
    # out-out: 11a's lambda^2 R / v, except the few destinations closer than R to the hub (leg ends first)
    assert math.isclose(a["rates"]["oo"][0], b["oo"] * 3600, rel_tol=1e-3)


def test_still_air_simulator_equals_11a():
    dests = _ring(90)
    a = wind.simulate(dests, 60, n_flights=5000, seed=4)
    b = run.simulate(dests, 60, n_flights=5000, seed=4)
    assert a["counts"] == b["counts"]


def test_windy_closed_form_tracks_simulator():
    dests = run.load_nyc()
    w = wind.wind_vec(6.0, 1.0)
    s = wind.simulate(dests, 60, wind=w, n_flights=30000, seed=2)
    c = wind.closed_form(dests, 60, wind=w, pairs=100000)
    assert abs(wind.out_rate_h(s) / c["out"] - 1) < 0.08


def test_split_layers_in_still_air_have_no_en_route_conflicts():
    c = wind.closed_form(_ring(72), 60, split=True, pairs=20000)
    assert c["out"] == 0.0
