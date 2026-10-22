from dataclasses import replace

import numpy as np

from infra_hvacmpc import (Params, load_weather, discretise, cop_heat, cop_cool, thermostat_year, mpc_year,
                           TOU_PRICES, FLAT_PRICES, scaled_tou)

P = Params()


def test_steady_state_matches_ua_balance():
    # constant weather, constant q: fixed point must satisfy UA_total (Ti - To) = q + gains
    A, B = discretise(P)
    q, to, g = 1500.0, -3.0, 200.0
    x = np.array([10.0, 10.0])
    for _ in range(3000):
        x = A @ x + B @ np.array([q, to, g])
    ua = P.ua_a() + P.ua_opaque          # opaque path: two UA*2 in series = UA
    assert abs(ua * (x[0] - to) - (q + g)) < 1e-6
    assert abs(x[1] - (x[0] + to) / 2) < 1e-6


def test_discretise_matches_euler_for_small_step():
    A, B = discretise(P, dt=1.0)
    x0 = np.array([20.0, 15.0])
    to, q = 0.0, 500.0
    uo2, ua = 2 * P.ua_opaque, P.ua_a()
    d_ti = (ua * (to - x0[0]) + uo2 * (x0[1] - x0[0]) + q) / P.ci
    d_te = (uo2 * (x0[0] - x0[1]) + uo2 * (to - x0[1])) / P.ce
    x1 = A @ x0 + B @ np.array([q, to, 0.0])
    assert np.allclose(x1 - x0, [d_ti, d_te], rtol=1e-3, atol=1e-9)


def test_heat_pump_cop_matches_published_fit():
    assert abs(cop_heat(0.0) - (6.81 - 0.121 * 35 + 0.00063 * 35 ** 2)) < 1e-12
    assert cop_heat(-10) < cop_heat(0) < cop_heat(7)
    assert cop_cool(35) < cop_cool(25)


def test_weather_files():
    for s, lo in (("greensboro-nc", -20), ("sand-point-ak", -20)):
        to, g = load_weather(s)
        assert len(to) == len(g) == 8760 and to.min() > lo and g.min() >= 0
    to, _ = load_weather("greensboro-nc")
    hdd_f = np.maximum(18 - to, 0).sum() / 24 * 1.8
    assert 3000 < hdd_f < 4500          # Greensboro's published normal is about 3,800 degF-days


def test_scaled_tou_keeps_mean_and_ratio():
    for r in (1, 3, 6):
        pr = scaled_tou(r)
        assert abs(sum(pr) / 24 - sum(TOU_PRICES) / 24) < 1e-12
        assert abs(max(pr) / min(pr) - r) < 1e-9


def test_thermostat_holds_setpoint_in_mild_weather():
    to = np.full(240, 10.0)
    g = np.zeros(240)
    r = thermostat_year(P, to, g, FLAT_PRICES, sp_heat=21.0)
    assert abs(r["ti"][-1] - 21.0) < 0.2 and r["cost"] > 0


def test_mpc_on_exact_model_beats_thermostat_on_tou_and_stays_comfortable():
    to, g = load_weather("greensboro-nc")
    n = 24 * 10                                         # ten January days
    th = thermostat_year(P, to, g, TOU_PRICES, sp_heat=20.0, kp=500.0, ki=150.0, hours=n)
    m = mpc_year(P, P, to, g, TOU_PRICES, forecast="perfect", hours=n)
    assert m["cost"] < th["cost"]
    assert m["disc"] < 1.0


def test_mpc_shifts_load_off_peak_on_tou_but_not_on_flat_tariff():
    to, g = load_weather("greensboro-nc")
    n = 24 * 10
    f = mpc_year(P, P, to, g, FLAT_PRICES, forecast="perfect", hours=n)
    t = mpc_year(P, P, to, g, TOU_PRICES, forecast="perfect", hours=n)
    assert abs(f["cost"] / f["kwh"] - 0.30) < 1e-9                       # nothing to shift
    assert t["cost"] / t["kwh"] < 0.95 * sum(TOU_PRICES) / 24            # pays well under the mean price


def test_oversized_loss_makes_comfort_violations_not_crash():
    to, g = load_weather("greensboro-nc")
    big = replace(P, ua_inf=P.ua_inf * 6)
    r = mpc_year(big, P, to, g, TOU_PRICES, forecast="persistence", hours=24 * 3)
    assert r["disc"] >= 0 and np.isfinite(r["cost"])
