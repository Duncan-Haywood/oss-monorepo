import numpy as np
import pytest
from energy_home import Home, year_weather, year_load
from energy_tou import TOU
from energy_tou_lp.model import rolling_dispatch, year_prices, no_battery_bill, _net
from energy_tou_lp_forecast import forecast_dispatch, forecast_series

GHI, LOAD = year_weather(1), year_load(8000, 1)
H = Home(6.0, batt_kwh=10.0)
N = 24 * 30
PV = np.array([H.pv_kw * H.perf_ratio * g / 1000.0 for g in GHI[:N]])
LD = np.asarray(LOAD[:N], float)
PR = year_prices(TOU, N)


def test_perfect_forecast_matches_rolling_lp():
    sur, need = _net(H, GHI[:N], LOAD[:N])
    ref = rolling_dispatch(H, sur, need, PR, TOU.export)["cost"]
    got = forecast_dispatch(H, PV, LD, PR, TOU.export, "perfect")["cost"]
    assert got == pytest.approx(ref, rel=1e-6)


def test_persistence_uses_only_past():
    a = np.arange(200, dtype=float)
    f = forecast_series("persistence", a, 100, 136)
    # every forecast value must come from an hour before the origin
    assert all(v < 100 for v in f)
    a2 = a.copy(); a2[100:] = 1e6          # changing the future must not change the forecast
    assert np.array_equal(f, forecast_series("persistence", a2, 100, 136))
    assert np.array_equal(forecast_series("week_mean", a, 100, 136), forecast_series("week_mean", a2, 100, 136))


def test_no_battery_equals_bill():
    h0 = Home(6.0)
    r = forecast_dispatch(h0, PV, LD, PR, TOU.export, "persistence")
    assert r["cost"] == pytest.approx(no_battery_bill(h0, GHI[:N], LOAD[:N], TOU))


def test_imperfect_forecast_not_better_than_perfect_on_average():
    base = forecast_dispatch(H, PV, LD, PR, TOU.export, "perfect")["cost"]
    for k in ("persistence", "week_mean"):
        assert forecast_dispatch(H, PV, LD, PR, TOU.export, k)["cost"] >= base - 1e-6


def test_noise_zero_equals_perfect_and_more_noise_costs_more():
    c0 = forecast_dispatch(H, PV, LD, PR, TOU.export, "noisy", 0.0)["cost"]
    assert c0 == pytest.approx(forecast_dispatch(H, PV, LD, PR, TOU.export, "perfect")["cost"])
    assert forecast_dispatch(H, PV, LD, PR, TOU.export, "noisy", 1.0, seed=3)["cost"] > c0
