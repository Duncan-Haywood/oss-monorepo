import importlib.util
import pathlib

_p = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_throughput" / "run.py"
_s = importlib.util.spec_from_file_location("hub_run", _p)
hub = importlib.util.module_from_spec(_s)
_s.loader.exec_module(hub)


def test_erlang_c_single_server_matches_mm1():
    # M/M/1: Wq = rho / (mu - lam)
    lam, mu = 0.5, 1.0
    assert abs(hub.erlang_c_wait(lam, mu, 1) - lam / (mu * (mu - lam))) < 1e-12


def test_simulation_matches_erlang_c():
    mu = 1 / 180.0
    lam = 0.7 * 4 * mu
    m = sum(hub.simulate(lam, 4, lambda r: r.expovariate(mu), "pad_only", n=100000, seed=s)[0] for s in range(3)) / 3
    assert abs(m - hub.erlang_c_wait(lam, mu, 4)) / hub.erlang_c_wait(lam, mu, 4) < 0.05


def test_saturated_swap_throughput_equals_charger_limit():
    Tc = 0.7 * 32 * 60
    thr = hub.simulate(0.01, 4, lambda r: 180.0, "swap", chargers=4, spares=8, T_charge=Tc, n=20000)[2]
    assert abs(thr * 3600 - 4 * 3600 / Tc) / (4 * 3600 / Tc) < 0.03
