import numpy as np
import pytest
from energy_home import Home, year_weather, year_load
from energy_tou import TOU
from energy_tou_lp.model import year_prices, no_battery_bill
from energy_tou_lp_forecast import forecast_dispatch
from energy_tou_lp_tmy import SITES, load_ghi, clear_sky, forecast_pv, forecast_load, tmy_dispatch, day_errors

H = Home(6.0, batt_kwh=10.0)
N = 24 * 20


@pytest.mark.parametrize("site", list(SITES))
def test_data_shape_and_range(site):
    g = load_ghi(site)
    assert g.shape == (8760,) and g.min() >= 0
    assert 1000 < g.sum() / 1000 < 2500          # kWh/m2/yr, plausible for the contiguous US
    assert g.max() < 1200


def test_clear_sky_bounds_and_night():
    cs = clear_sky("golden-co")
    assert cs.max() <= 1098 and cs.min() == 0
    assert cs[0] == 0 and cs[12] > 0              # midnight dark, noon lit on 1 January


@pytest.mark.parametrize("kind", ["persistence", "smart", "smart_week"])
def test_forecast_uses_past_only(kind):
    g, cs = load_ghi("golden-co"), clear_sky("golden-co")
    s = 24 * 100
    a = forecast_pv(kind, g, cs, s, s + 36)
    g2 = g.copy()
    g2[s:] = g2[s:][::-1] * 3                      # change the future
    assert np.allclose(a, forecast_pv(kind, g2, cs, s, s + 36))


def test_load_forecast_uses_past_only():
    ld = np.asarray(year_load(8000, 1))
    s = 24 * 40
    a = forecast_load("persistence", ld, s, s + 36)
    ld2 = ld.copy()
    ld2[s:] *= 5
    assert np.allclose(a, forecast_load("persistence", ld2, s, s + 36))


def test_smart_is_exact_when_sky_is_constant():
    cs = clear_sky("phoenix-az")
    g = 0.7 * cs                                   # every day has clear-sky index 0.7
    s = 24 * 50
    assert np.allclose(forecast_pv("smart", g, cs, s, s + 36), g[s:s + 36])
    assert day_errors("smart", g, cs)[0] < 1e-9


def test_perfect_matches_energy_tou_lp_forecast():
    g = np.array(year_weather(2)[:N], float)
    cs = clear_sky("golden-co")[:N]
    ld = np.asarray(year_load(8000, 2)[:N], float)
    pr = year_prices(TOU, N)
    pv = H.pv_kw * H.perf_ratio * g / 1000.0
    a = forecast_dispatch(H, pv, ld, pr, TOU.export, "perfect", wear=0.05)
    b = tmy_dispatch(H, g, cs, ld, pr, TOU.export, "perfect", "perfect", 0.05)
    assert b["cost"] == pytest.approx(a["cost"], rel=1e-9)


def test_no_battery_equals_bill():
    g = load_ghi("seattle-wa")[:N]
    ld = np.asarray(year_load(8000, 3)[:N], float)
    h0 = Home(6.0, batt_kwh=0.0)
    r = tmy_dispatch(h0, g, clear_sky("seattle-wa")[:N], ld, year_prices(TOU, N), TOU.export, "smart", "persistence")
    assert r["cost"] == pytest.approx(no_battery_bill(h0, g, ld, TOU), rel=1e-9)


def test_realistic_forecasts_never_beat_perfect():
    g, cs = load_ghi("golden-co")[:N], clear_sky("golden-co")[:N]
    ld = np.asarray(year_load(8000, 1)[:N], float)
    pr = year_prices(TOU, N)
    best = tmy_dispatch(H, g, cs, ld, pr, TOU.export, "perfect", "perfect", 0.05)["cost"]
    for kind in ("persistence", "smart", "smart_week"):
        assert tmy_dispatch(H, g, cs, ld, pr, TOU.export, kind, "persistence", 0.05)["cost"] >= best - 1e-6
