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


_pa = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_throughput" / "cargo_hub_aged_cells.py"
_sa = importlib.util.spec_from_file_location("hub_aged", _pa)
aged = importlib.util.module_from_spec(_sa)
_sa.loader.exec_module(aged)


def test_aged_groups_split_on_capacity():
    rows = [{"cell": "X", "k": k, "first_capacity_Ah": 2.0, "prev_capacity_Ah": 2.0 - 0.1 * k} for k in range(1, 9)]
    by, fresh, old = aged.groups(rows)
    assert [r["k"] for r in fresh] == [1, 2, 3, 4, 5]
    assert [r["k"] for r in old] == [5, 6, 7, 8]          # 1.5 Ah and below is < 0.8 x 2.0


def test_measured_nasa_taper_is_longer_than_linear():
    import json
    rows = json.load(open(_pa.parent / "nasa_charge_metrics.json"))["charges"]
    _, fresh, old = aged.groups(rows)
    assert len(fresh) == 20 and len(old) > 100
    assert all(r["ratio_30_100"] > r["ratio_20_90"] > 1.0 for r in fresh)


_pw = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_throughput" / "analytic_wait_tail.py"
_sw = importlib.util.spec_from_file_location("hub_wait_tail", _pw)
tail6j = importlib.util.module_from_spec(_sw)
_sw.loader.exec_module(tail6j)


def test_sub_exp_conserves_mass_and_mean():
    x = [0.0] * 2000
    x[1000] = 1.0
    lam = 1 / 600.0
    out, neg = tail6j.sub_exp(x, lam)
    assert abs(sum(out) + neg - 1.0) < 1e-12
    m = tail6j.DT * sum(i * v for i, v in enumerate(out))
    assert abs(m - (10000.0 - 600.0)) < 2.0


def test_batch_of_c_charger_wait_is_md1():
    # k = c: each charger sees one pack per batch, an M/D/1 queue with Wq = rho D / (2 (1 - rho))
    rate = 0.7 * tail6j.CH * 3600 / tail6j.D
    wq, _ = tail6j.charger_wait_pmf(rate, tail6j.CH)
    assert abs(tail6j.pmf_mean(wq) - 0.7 * tail6j.D / (2 * 0.3)) < 5.0


def test_wait_tail_at_zero_matches_6i_wait_share():
    rate = 0.7 * tail6j.CH * 3600 / tail6j.D
    wq, _ = tail6j.charger_wait_pmf(rate, 2)
    t = tail6j.pack_wait_tails(wq, rate, 2, 20, (0.0, 300.0))
    p = ana.outstanding_pmf(rate, 2)
    for S in (10, 14, 18):
        assert abs(t[S][0.0] - ana.wait_share(p, S, 2)) < 0.003
        assert t[S][300.0] < t[S][0.0]


_pk = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_throughput" / "analytic_trace_tail.py"
_sk = importlib.util.spec_from_file_location("hub_trace_tail", _pk)
tail6k = importlib.util.module_from_spec(_sk)
_sk.loader.exec_module(tail6k)


def test_rate_integral_is_exact_on_bins():
    r = tail6k.Rate([3600.0, 7200.0])  # 1/s then 2/s, 900 s bins
    assert abs(r.L(0, 1800) - 2700.0) < 1e-9
    assert abs(r.L(450, 1350) - (450 + 900)) < 1e-9
    assert r.L(-100, 0) == 0.0


def test_time_varying_rule_at_constant_rate_matches_6i():
    rate = 0.7 * tail6k.CH * 3600 / tail6k.D
    r = tail6k.Rate([rate] * int(2 * 86400 / tail6k.BIN))
    nq = tail6k.nq_path(r, 1)
    got = tail6k.order_tails(r, 1, nq, 0.0, [11])[11]
    assert abs(got - ana.wait_share(ana.outstanding_pmf(rate, 1), 11, 1)) < 0.003


def test_heap_simulator_matches_6f_run():
    import random
    counts = tail6k.h6f.load_profile()["2019-10-09"]
    for sd in range(3):
        ts = tail6k.h6f.arrivals(counts, 8.0, "uniform", random.Random(sd), 2)
        w = sorted(tail6k.sim_waits(ts, 14))
        mean, p95 = tail6k.h6f.run(ts, 14)
        assert abs(sum(w) / len(w) - mean) < 1e-9 and w[int(0.95 * len(w))] == p95
