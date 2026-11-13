"""Checks for the BattLeDIM loader, detector and scorer (no network needed)."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from water_leaks import data, detect, network, score  # noqa: E402


def t(s):
    return np.datetime64(s, "m")


def test_parse_scada_decimal_commas():
    ts, cols, X = data.parse_scada("Timestamp;n1;n4\n2019-01-01 00:00:00;28,63;33,7\n"
                                   "2019-01-01 00:05:00;28,66;33,75\n")
    assert cols == ["n1", "n4"]
    assert ts[1] - ts[0] == np.timedelta64(5, "m")
    assert np.allclose(X, [[28.63, 33.7], [28.66, 33.75]])


def test_parse_config_leaks():
    txt = ("leakages:\n- # linkID, startTime\n- p257, 2018-01-08 13:30, 2019-12-31 23:55, 0.011843, "
           "incipient, 2018-01-25 08:30\n- p673, 2018-03-05 15:45, 2018-03-23 10:25, 0.022916, abrupt, "
           "2018-03-05 15:45\n\npressure_sensors:\n- n1\n")
    lk = data.parse_config_leaks(txt)
    assert [x[0] for x in lk] == ["p257", "p673"]
    assert lk[1][4] == "abrupt" and lk[0][3] == 0.011843


def test_hourly_means():
    ts = np.arange(t("2019-01-01T00:00"), t("2019-01-01T02:00"), np.timedelta64(5, "m"))
    X = np.arange(24, dtype=float).reshape(-1, 1)
    h, Y = detect.hourly(ts, X)
    assert len(h) == 2 and np.allclose(Y[:, 0], [5.5, 17.5])


def test_design_weekday_weekend():
    hrs = np.arange(np.datetime64("2019-01-05T00", "h"), np.datetime64("2019-01-08T00", "h"))  # Sat..Mon
    A = detect.design(hrs, np.zeros(len(hrs)))
    # Saturday 00:00 -> weekend column 24, Monday 00:00 -> weekday column 0
    assert A[0, 24] == 1 and A[48, 0] == 1 and A[:, :48].sum() == len(hrs)


def test_residuals_flag_a_step_drop_and_cusum_alarms_once():
    rng = np.random.default_rng(1)
    days = 40
    hrs = np.arange(np.datetime64("2019-01-01T00", "h"), np.datetime64("2019-01-01T00", "h") + np.timedelta64(days * 24, "h"))
    hod = (hrs - hrs.astype("datetime64[D]")).astype(int)
    level = 3 + np.sin(np.arange(len(hrs)) / 7.0)
    P = (40 + 2 * np.sin(2 * np.pi * hod / 24) + 0.5 * level)[:, None] + rng.normal(0, 0.1, (len(hrs), 3))
    onset = 30 * 24
    P[onset:, 1] -= 1.0  # a leak lowers sensor 1 by 1 m (10 sd)
    A = detect.design(hrs, level)
    Z = detect.residual_z(P, A, W=14, g=7)
    assert np.isnan(Z[: 21 * 24]).all()
    assert np.nanmean(Z[onset:onset + 24, 1]) < -5
    assert abs(np.nanmean(Z[21 * 24:onset, 1])) < 1
    # the plain hold-off version alarms again once the hold-off ends (the leak is not yet
    # in its window); re-anchoring declares the leak once
    al = detect.cusum_alarms(Z, k=0.5, h=50, holdoff=7 * 24)
    assert len(al) == 2
    al, Zs = detect.detect_sequential(P, A, W=14, g=7, wmin=7, k=0.5, h=50)
    assert len(al) == 1 and al[0][1] == 1 and onset <= al[0][0] < onset + 24


def test_cusum_ignores_upward_shift():
    Z = np.zeros((500, 2))
    Z[100:, 0] = 5.0  # pressure rises: not a leak
    assert detect.cusum_alarms(Z, k=0.5, h=20) == []


def test_match_latest_onset_and_window():
    ev = [("a", t("2019-01-01T00:00"), t("2019-12-31T00:00"), 5, 0),
          ("b", t("2019-03-01T00:00"), t("2019-12-31T00:00"), 5, 0)]
    m, fp = score.match([t("2019-03-02T00:00"), t("2019-03-05T00:00"), t("2019-11-01T00:00")], ev)
    assert m == {1: t("2019-03-02T00:00"), 0: t("2019-03-05T00:00")} or m[1] == t("2019-03-02T00:00")
    # leak a's 30-day window closed on 2019-01-31, so the 03-05 alarm is false
    assert 0 not in m and len(fp) == 2


def test_merge_years_keeps_2018_onset():
    e18 = [("p1", t("2018-05-01T00:00"), t("2018-12-31T23:55"), 3.0, 10.0),
           ("p2", t("2018-02-01T00:00"), t("2018-03-01T00:00"), 9.0, 5.0)]
    e19 = [("p1", t("2019-01-01T00:00"), t("2019-12-31T23:55"), 4.0, 20.0),
           ("p3", t("2019-06-01T00:00"), t("2019-07-01T00:00"), 7.0, 1.0)]
    ev, carried = score.merge_years(e18, e19)
    assert [e[0] for e in ev] == ["p1", "p2", "p3"] and carried == {0}
    assert ev[0][1] == t("2018-05-01T00:00") and ev[0][2] == t("2019-12-31T23:55") and ev[0][4] == 30.0


def test_network_distances():
    inp = ("[PIPES]\n p1 a b 100 200 140 0 Open ;\n p2 b c 50 200 140 0 Open ;\n"
           "[VALVES]\n v1 c d 100 PRV 30 0\n[COORDINATES]\n a 0 0\n b 100 0\n c 150 0\n d 150 10\n")
    coords, links = network.parse_inp(inp)
    gd = network.graph_dist(links, "a")
    assert gd["d"] == 150 and network.pipe_dist(links, gd, "p2") == 125
    assert network.euclid_to_pipe(coords, links, "a", "p2") == 125


# --- step 2: automatic LILA -------------------------------------------------------------

from water_leaks import lila  # noqa: E402


def _network(T=24 * 40, s=4, seed=0):
    """Pressures driven by one common demand signal plus small noise, as in a DMA."""
    rng = np.random.default_rng(seed)
    hod = np.arange(T) % 24
    v = 40 + 10 * np.sin(2 * np.pi * hod / 24) + rng.normal(0, 0.5, T)
    P = np.column_stack([50 - 0.1 * (k + 1) * v + rng.normal(0, 0.05, T) for k in range(s)])
    return P, v


def test_lila_pair_models_reconstruct_leak_free_data():
    P, v = _network()
    B = lila.fit_pairs(P, v)
    e = lila.errors(P, v, B)
    assert np.allclose(e[np.arange(4), np.arange(4)], 0)    # a sensor predicts itself exactly
    assert np.abs(e).mean() < 0.2


def test_lila_mas_is_the_sensor_that_drops():
    # with v in every model the other sensors' votes are coin flips, so a few sensors can tie
    # with the leaking one by chance; 12 sensors make that rare
    P, v = _network(s=12)
    B = lila.fit_pairs(P[:480], v[:480])
    Q = P[480:].copy()
    Q[:, 2] -= 1.0                                           # a leak near sensor 2
    e = lila.errors(Q, v[480:], B)
    votes = (e > 0).sum(axis=0)
    assert (votes[2] == 11).all()                            # every model finds sensor 2 low
    assert lila.tie_share(e) > 0.5                           # ...but others often tie with it
    assert (lila.mre(e, "norm").argmax(axis=1) == 2).all()   # the norm tie-break finds it
    M = lila.mre(e)
    assert (M > 0).sum(axis=1).max() == 1                    # one MAS per step


def test_lila_detects_a_step_once_at_its_sensor():
    P, v = _network(T=24 * 60)
    P[24 * 40 + 5:, 1] -= 1.0
    al, _ = lila.detect_lila(P, v, W=14, g=7, wmin=7, delta=1.0, c_thr=20)
    assert len(al) == 1
    t, i = al[0]
    assert i == 1 and 24 * 40 + 5 <= t <= 24 * 41 + 5


def test_lila_rare_mas_sensor_is_not_disabled():
    M = np.zeros((100, 3))
    M[:, 0] = 1.0 + 0.1 * np.arange(100) % 3
    mu, sd = lila.ref_stats(M)
    assert np.isfinite(sd).all() and mu[1] == 0 and sd[1] == sd[0]


def test_mnf_net_demand_removes_tank_storage():
    from water_leaks import mnf
    # inflow 100 m3/h while the tank rises 0.1 m/h: 20.1 m3/h goes into storage
    level = 2.0 + 0.1 * np.arange(10)
    q = mnf.net_demand(np.full(10, 100.0), level)
    assert np.allclose(q, 100.0 - mnf.TANK_AREA * 0.1)
    assert np.allclose(mnf.net_demand(np.full(10, 100.0), level, tank=False), 100.0)


def test_mnf_night_min_uses_hours_0_to_5():
    from water_leaks import mnf
    q = np.full(48, 50.0)
    q[3] = 10.0     # night of day 0
    q[30] = 5.0     # 06:00 on day 1 is not night
    assert list(mnf.night_min(q)) == [10.0, 50.0]


def test_mnf_detects_a_step_once_and_rearms():
    from water_leaks import mnf
    rng = np.random.default_rng(3)
    m = 60 + rng.normal(0, 1.0, 120)
    m[50:] += 5.0                     # a 5 m3/h leak from day 50
    al, z = mnf.detect_mnf(m, h=5.0)
    days = [t // 24 for t, _ in al]
    assert all(t % 24 == mnf.ALARM_HOUR for t, _ in al)
    assert any(50 <= d <= 53 for d in days)
    # re-anchored: the step is absorbed, so it does not alarm again while it settles in
    assert sum(1 for d in days if 50 <= d < 80) == 1
    assert np.isnan(z[:14]).all() and not np.isnan(z[14])  # g + wmin days, as D1
