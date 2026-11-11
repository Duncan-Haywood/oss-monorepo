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


_pa = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_throughput" / "analytic_spares.py"
_sa = importlib.util.spec_from_file_location("hub_analytic", _pa)
ana = importlib.util.module_from_spec(_sa)
_sa.loader.exec_module(ana)


def test_md1_recursion_matches_pollaczek_khinchine():
    # M/D/1 mean number in system: L = rho + rho^2 / (2 (1 - rho))
    for rho in (0.3, 0.6, 0.85):
        pi = ana.mdc_stationary(ana.poisson_pmf(rho, 300), 1)
        L = rho + rho ** 2 / (2 * (1 - rho))
        assert abs(ana.mean(pi) - L) < 1e-6


def test_mdc_with_many_servers_is_poisson():
    # with c far above the offered load nobody queues: N ~ Poisson(lam D)
    pi = ana.mdc_stationary(ana.poisson_pmf(2.0, 200), 40)
    ref = ana.poisson_pmf(2.0, 200)
    assert sum(abs(x - y) for x, y in zip(pi, ref)) < 1e-9


def test_wait_share_is_a_tail_probability():
    p = ana.poisson_pmf(5.0, 200)
    # single orders: share waiting = P(N >= S)
    assert abs(ana.wait_share(p, 5, 1) - sum(p[5:])) < 1e-12
    # batches make it worse at the same mean
    p4 = ana.batch_pmf(5.0 / 4, 1.0, 4, 200)
    assert ana.wait_share(p4, 10, 4) > ana.wait_share(p, 10, 1)


def test_analytic_share_tracks_simulator_poisson():
    rate = 0.7 * ana.CH * 3600 / ana.D
    p = ana.outstanding_pmf(rate, 1)
    a = ana.wait_share(p, 9, 1)
    s = ana.sim_share(rate, 1, 9, seeds=2, orders=20000)
    assert abs(a - s) < 0.03
