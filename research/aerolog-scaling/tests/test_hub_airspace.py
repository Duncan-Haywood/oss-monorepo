import importlib.util
import math
import pathlib

_p = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace" / "run.py"
_s = importlib.util.spec_from_file_location("hub_airspace_run", _p)
air = importlib.util.module_from_spec(_s)
_s.loader.exec_module(air)


def _ring(n, d=3000.0):
    return [(d * math.cos(2 * math.pi * k / n), d * math.sin(2 * math.pi * k / n)) for k in range(n)]


def test_out_out_conflicts_match_lambda_squared_r_over_v():
    # diverging outbound pairs conflict only when the second enters within R / v of the first
    dests = _ring(360)
    s = air.simulate(dests, 60, v=20.0, R=50.0, n_flights=40000, seed=5)
    oo = sum(s["rates"]["oo"])
    expect = (60 / 3600) ** 2 * 50.0 / 20.0
    assert abs(oo / expect - 1) < 0.08
    assert s["rates"]["oo"][1] == 0.0          # never outside the terminal radius


def test_closed_form_matches_simulator_uniform_disc():
    dests = air.disc(5000)
    s = air.simulate(dests, 60, n_flights=40000, seed=7)
    c = air.closed_form(dests, 60, pairs=100000)
    assert abs(air.total(s) / c["all"] - 1) < 0.06
    assert abs(air.total(s, True) / c["io_out"] - 1) < 0.08


def test_split_layers_with_equal_speeds_have_no_en_route_conflicts():
    dests = air.disc(2000)
    s = air.simulate(dests, 120, split=True, n_flights=20000, seed=9)
    # in-out pairs vanish; en-route conflicts left are only the rare re-entry of an aircraft at its destination
    # just as another on nearly the same bearing passes over it (an edge effect the closed form ignores)
    assert s["rates"]["io"] == (0.0, 0.0)
    assert air.total(s, True) < 0.002 * air.total(s)


def test_gas_model_formula():
    # one aircraft pair density check: N^2 * 4 R v / (pi A)
    g, N = air.gas_model([(1000.0, 0.0)], 3600.0, v=10.0, R=10.0, dmax=1000.0)
    assert abs(N - 200.0) < 1e-9
    assert abs(g - 4 * N * N * 10 * 10 / (math.pi * math.pi * 1e6)) < 1e-12
