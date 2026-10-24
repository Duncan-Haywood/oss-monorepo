import numpy as np
import pytest
from energy_home import Home, year_load
from energy_tou import TOU
from energy_tou_lp.model import year_prices
from energy_tou_lp_tmy import load_ghi, clear_sky, tmy_dispatch
from energy_tou_lp_replan import forecast_pv_now, nowcast_index, replan_dispatch

H = Home(6.0, batt_kwh=10.0)
N = 24 * 15
G, CS, L, PR = load_ghi("golden-co"), clear_sky("golden-co"), year_load(8000, 0), year_prices(TOU, 8760)


def run(step, kind="smart", lk="persistence", g=G, **kw):
    return replan_dispatch(H, g[:N], CS[:N], L[:N], PR[:N], TOU.export, kind, lk, 0.05, step=step, **kw)


@pytest.mark.parametrize("kind", ["smart", "persistence", "perfect"])
def test_step_24_reproduces_tmy(kind):
    ref = tmy_dispatch(H, G[:N], CS[:N], L[:N], PR[:N], TOU.export, kind, "persistence", 0.05)
    assert run(24, kind)["cost"] == pytest.approx(ref["cost"], rel=1e-9)


def test_nowcast_uses_past_only():
    s = 24 * 100 + 15
    a = forecast_pv_now("nowcast", G, CS, s, s + 36)
    g2 = G.copy()
    g2[s:] = 0.0
    assert np.allclose(a, forecast_pv_now("nowcast", g2, CS, s, s + 36))
    assert nowcast_index(G, CS, s) == nowcast_index(g2, CS, s)


def test_nowcast_relaxes_to_daily_index():
    s = 24 * 100 + 20
    f = forecast_pv_now("nowcast", G, CS, s, s + 36, tau=1e-6)       # no memory of the last hours
    ref = forecast_pv_now("smart", G, CS, s, s + 36)
    assert np.allclose(f, ref)


def test_perfect_forecast_gains_nothing_from_replanning():
    # with the truth known the day-ahead plan is already right; re-planning only shortens the commit
    a, b = run(24, "perfect", "perfect")["cost"], run(3, "perfect", "perfect")["cost"]
    assert b == pytest.approx(a, rel=0.01)


def test_no_battery_cost_independent_of_step():
    h0 = Home(6.0, batt_kwh=0.0)
    f = lambda st: replan_dispatch(h0, G[:N], CS[:N], L[:N], PR[:N], TOU.export, "smart", "persistence", 0.05, step=st)["cost"]
    assert f(24) == pytest.approx(f(6), rel=1e-9)


def test_realistic_never_beats_perfect_by_much():
    assert run(6, "nowcast")["cost"] >= run(6, "perfect", "perfect")["cost"] - 1e-6
