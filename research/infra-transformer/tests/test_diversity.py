import numpy as np
from dataclasses import replace
from infra_transformer import (Xfmr, Params, simulate, simulate_dt, annual_lol_pct, annual_lol_pct_dt,
                               Pop, simulate_population, hourly_mean, minute_temps, design_temp, heat_pump_kw)

P = Params()
X = Xfmr(rated_kva=50.0)


def test_simulate_dt_hourly_matches_simulate():
    rng = np.random.default_rng(3)
    load = 30 + 20 * rng.random(8760)
    amb = 10 + 10 * np.sin(np.arange(8760) / 500)
    a = simulate(load, amb, X)[0]
    b = simulate_dt(load, amb, X, 1.0, 0.0)[0]
    assert np.allclose(a, b)
    assert abs(annual_lol_pct(load, amb, X) - annual_lol_pct_dt(load, amb, X, 1.0)) < 1e-9


def test_simulate_dt_constant_load_is_step_invariant_and_vectorised():
    load = np.full((2, 600), 50.0)
    th = simulate_dt(load, np.full(600, 30.0), X, 1 / 60, 0.1)[0]
    assert np.allclose(th[:, -1], 110.0)
    # one year at FAA = 1 at minute resolution still consumes 4.87 % of life
    lol = annual_lol_pct_dt(np.full(8760 * 60, 50.0), np.full(8760 * 60, 30.0), X, 1 / 60)
    assert abs(lol - 8760 / 180000 * 100) < 1e-6


def test_winding_lag_reaches_1_minus_1_over_e():
    load = np.concatenate([np.zeros(600), np.full(600, 50.0)])
    th = simulate_dt(load, np.zeros(1200), replace(X, tau_to=1e9), 1 / 60, 0.1, warm_cycles=1)[0]
    # top oil frozen (huge tau), so hot spot - top oil follows the winding lag: 25 K x (1 - e^-1) after 6 min
    rise = th[600 + 5] - th[599]
    assert abs(rise - 25 * (1 - np.exp(-1))) < 0.05


def test_minute_temps_interpolates_and_keeps_mean():
    h = np.array([0.0, 6.0, 12.0])
    m = minute_temps(h)
    assert len(m) == 180 and m[0] == 0 and abs(m[30] - 3.0) < 1e-12 and abs(m.mean() - h.mean()) < 1e-12


def _const_year(t):
    return np.full(8760, float(t))


def test_population_energy_matches_steady_state_above_capacity_range():
    # constant 5 C: every home needs UA (Tset - 5) - gain; variable-speed delivers it; no strip, no capacity limit
    temp = np.concatenate([np.full(8560, 5.0), np.full(200, -10.0)])   # design temp -10 C
    pop = Pop(ua_cv=0.0, t_set_sd=0.0, single_stage=False)
    g, info = simulate_population(temp, P, pop, 3, 2, seed0=0)
    steady = 3 * heat_pump_kw(np.array([5.0]), P)[0]
    hm = hourly_mean(g)[:, 200:8000]
    assert np.allclose(hm.mean(axis=1), steady, rtol=0.01)
    assert info["strip_h_per_home"] < 1.0


def test_single_stage_holds_band_and_conserves_energy_on_average():
    temp = np.concatenate([np.full(8560, 0.0), np.full(200, -10.0)])
    pop = Pop(ua_cv=0.0, t_set_sd=0.0, single_stage=True)
    g, _ = simulate_population(temp, P, pop, 4, 1, seed0=2)
    steady = 4 * heat_pump_kw(np.array([0.0]), P)[0]
    assert abs(g[0, 200 * 60:8000 * 60].mean() / steady - 1) < 0.02     # duty cycle delivers the steady demand
    # on/off: individual draws are 0 or full, so one home's minute series takes two values
    g1, info = simulate_population(temp, P, pop, 1, 1, seed0=2)
    vals = np.unique(np.round(g1[0, 200 * 60:8000 * 60], 6))
    assert len(vals) == 2 and vals[0] == 0.0


def test_no_heating_above_balance():
    g, _ = simulate_population(np.concatenate([[25.0] * 8560, [-5.0] * 200]), P, Pop(), 5, 2)
    assert g[:, 200 * 60:8000 * 60].max() == 0.0


def test_setback_creates_morning_recovery_peak():
    temp = np.concatenate([np.full(8560, 0.0), np.full(200, -10.0)])
    pop = Pop(ua_cv=0.0, t_set_sd=0.0, setback_k=3.0, single_stage=False)
    g, _ = simulate_population(temp, P, pop, 5, 1)
    day = hourly_mean(g)[0, 24 * 100:24 * 101]
    assert day[6] > 1.3 * day[12] and day[2] < day[12]


def test_design_temp_is_first_percentile():
    t = np.arange(8760, dtype=float)
    assert abs(design_temp(t) - np.percentile(t, 1)) < 1e-12
