import importlib.util
import math
import os

import numpy as np
import pytest

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ds = _mod("drift_share_test", "drift_share.py")
ll = _mod("level_leak_test_11al", "level_leak.py")


def _isd(f):
    """Synthetic two-station field: QNH(t) = f(t) at both stations, hourly reports."""
    t = np.arange(0.0, ds.YEAR_MIN + 120, 60.0)
    q = np.array([f(x) for x in t])
    return {"JFK": (t, q, (40.639, -73.762)), "LGA": (t, q + 0.0, (40.779, -73.880))}


def test_erf_matches_math():
    x = np.linspace(-4, 4, 81)
    assert np.max(np.abs(ds.erf(x) - np.array([math.erf(v) for v in x]))) < 2e-7


def test_interp_linear_and_gap_mask():
    ts, vs = np.array([0.0, 60.0, 400.0]), np.array([1000.0, 1001.0, 1002.0])
    v = ds.interp(ts, vs, [30.0, 59.0, 200.0, -1.0])
    assert v[0] == pytest.approx(1000.5) and v[1] == pytest.approx(1000.0 + 59.0 / 60.0)
    assert np.isnan(v[2]) and np.isnan(v[3])


def test_current_pressure_cancels_for_equal_ages():
    isd = _isd(lambda t: 1013.0 + 5.0 * math.sin(t / 700.0))
    rng = np.random.default_rng(0)
    a = rng.uniform(0, 60, 500)
    g = ds.gap_samples(rng, isd, a, a, 0.0)
    assert np.max(np.abs(g)) < 1e-9
    assert np.std(ds.drift_samples(rng, isd, a)) > 0.1        # the per-drone drift does not vanish


def test_time_part_is_the_change_over_the_age_difference():
    isd = _isd(lambda t: 1013.0 + t / 60.0)                   # 1 hPa per hour
    rng = np.random.default_rng(1)
    ai, aj = np.full(200, 30.0), np.full(200, 10.0)
    g = ds.gap_samples(rng, isd, ai, aj, 0.0)
    assert np.allclose(g, ds.M_PER_HPA * (-20.0 / 60.0))


def test_space_part_zero_for_identical_stations_and_scales_with_distance():
    isd = _isd(lambda t: 1013.0)
    rng = np.random.default_rng(2)
    z = np.zeros(300)
    assert np.max(np.abs(ds.gap_samples(rng, isd, z, z, 5.0))) < 1e-9
    t = isd["JFK"][0]
    isd["LGA"] = (t, 1013.0 + np.sin(t / 300.0), isd["LGA"][2])
    ds._PAIR_MEAN.clear()
    D = ds.haversine_km(isd["JFK"][2], isd["LGA"][2])
    s1 = np.std(ds.gap_samples(rng, isd, z, z, D))
    s2 = np.std(ds.gap_samples(rng, isd, z, z, D / 4))
    assert s2 == pytest.approx(s1 / 4, rel=0.15)
    ds._PAIR_MEAN.clear()


def test_weights_from_zero_mismatch_equals_level_weights():
    for h, k in ((13.33, 5), (9.2, 7)):
        pw, px = ds.weights_from(h, 7.62, 1.0 * math.sqrt(2), k, np.array([0.0]))
        qw, qx = ll.level_weights(h, 7.62, 1.0, k)
        assert np.allclose(pw, qw, atol=1e-6) and np.allclose(px, qx, atol=1e-6)


def test_compress_keeps_mean_and_extremes():
    x = np.random.default_rng(3).normal(0, 2, 4000)
    c = ds.compress(x, 100)
    assert len(c) == 100 and c.mean() == pytest.approx(x.mean(), abs=1e-9)
    assert c.min() < np.quantile(x, 0.01)


def _random_problem(m=6, k=4, seed=4):
    rng = np.random.default_rng(seed)
    W, X, V = rng.uniform(0, 1, (m, m)), rng.uniform(0, 1, (m, m)), rng.uniform(0, 0.2, (m, m))
    return W, X, V


def test_pair_problem_matches_level_leak_score_with_one_table():
    W, X, V = _random_problem()
    k = 4
    pw, px = ll.level_weights(11.0, 7.62, 1.0, k)
    P = ds.PairProblem(W, X, V, np.broadcast_to(pw, (6, 6, k)).copy(), np.broadcast_to(px, (6, 6, k)).copy())
    rng = np.random.default_rng(5)
    for _ in range(20):
        lab = tuple(int(v) for v in rng.integers(0, k, 6))
        assert P.score(lab) == pytest.approx(ll.score(W, X, V, lab, pw, px), rel=1e-12)


def test_pair_problem_descent_is_a_local_optimum_and_search_finds_exhaustive():
    W, X, V = _random_problem(m=5, k=3, seed=6)
    rng = np.random.default_rng(7)
    pw = rng.uniform(0, 1, (5, 5, 3))
    px = rng.uniform(0, 1, (5, 5, 3))
    pw, px = (pw + pw.transpose(1, 0, 2)) / 2, (px + px.transpose(1, 0, 2)) / 2
    P = ds.PairProblem(W, X, V, pw, px)
    lab = P.descend((0, 0, 0, 0, 0))
    f = P.score(lab)
    for i in range(5):
        for a in range(3):
            l2 = list(lab)
            l2[i] = a
            assert P.score(l2) >= f - 1e-12
    import itertools
    ex = min(P.score(l) for l in itertools.product(range(3), repeat=5))
    assert P.search(restarts=60, seed=0)[1] == pytest.approx(ex)


def test_mission_minutes_and_ages():
    t = ds.mission_minutes((0.0, 0.0), [(1200.0, 0.0), (0.0, 2400.0)], 20.0, dwell_min=1.0)
    assert np.allclose(t, [3.0, 5.0])
    rng = np.random.default_rng(8)
    a = ds.drone_ages(rng, 5000, "T30")
    assert a.min() >= 0 and a.max() <= 30 and a.mean() == pytest.approx(15, abs=0.5)
    b = ds.drone_ages(rng, 5000, "deliv", np.array([4.0]))
    assert b.max() <= 4.0
