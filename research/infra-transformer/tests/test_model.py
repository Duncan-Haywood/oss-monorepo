import numpy as np
from infra_transformer import Xfmr, simulate, aging_factor, heat_pump_kw, ev_kw, scenario_load, load_inputs, Params, annual_lol_pct

X = Xfmr(rated_kva=50.0)


def test_rated_load_30c_is_110c_and_unit_ageing():
    th, to, faa = simulate(np.full(8760, 50.0), np.full(8760, 30.0), X)
    assert abs(th[-1] - 110.0) < 1e-6 and abs(faa[-1] - 1.0) < 1e-9
    assert abs(to[-1] - 85.0) < 1e-6


def test_ageing_doubles_about_every_7k_at_110():
    r = aging_factor(117.0) / aging_factor(110.0)
    assert 1.9 < r < 2.2      # d ln FAA/dT = 15000/383^2 = 0.102 per K -> doubling per 6.8 K


def test_lol_at_rated_is_life_fraction():
    # one year at FAA = 1 consumes 8760/180000 = 4.867% of the insulation life
    assert abs(annual_lol_pct(np.full(8760, 50.0), np.full(8760, 30.0), X) - 8760 / 180000 * 100) < 1e-6


def test_step_response_time_constant():
    load = np.zeros(8760); load[100:] = 50.0
    _, to, _ = simulate(load, np.zeros(8760), X, warm_years=1)
    # after one tau the top-oil rise has covered 1-1/e of the step from the no-load value
    start = X.d_to_r * (1 / (X.r + 1)) ** X.n
    frac = (to[100 + 2] - start) / (X.d_to_r - start)   # 3 h after the step starts (index 100 is hour 1)
    assert abs(frac - (1 - np.exp(-1))) < 0.02


def test_ageing_monotone_in_load_and_ambient():
    a = annual_lol_pct(np.full(8760, 40.0), np.full(8760, 20.0), X)
    assert annual_lol_pct(np.full(8760, 60.0), np.full(8760, 20.0), X) > a
    assert annual_lol_pct(np.full(8760, 40.0), np.full(8760, 30.0), X) > a


def test_heat_pump_zero_above_balance_and_cop_floor():
    p = Params()
    assert heat_pump_kw(np.array([20.0]), p)[0] == 0.0
    cold = heat_pump_kw(np.array([-40.0]), p)[0]
    assert abs(cold - p.ua_kw_per_k * (p.t_bal + 40.0) / p.cop_floor) < 1e-9


def test_ev_energy_conserved_and_smart_flattens():
    p = Params(); inp = load_inputs()
    base = p.homes * inp["h0_kw"]
    u, s = ev_kw(base, 10, p, False), ev_kw(base, 10, p, True)
    want = 10 * p.ev_kwh_day * (365 - 1)
    assert abs(u.sum() - want) < 1e-3 and abs(s.sum() - want) < 1e-3
    assert (base + s).max() <= (base + u).max() + 1e-9
    assert s.max() <= 10 * p.ev_kw + 1e-9


def test_scenario_adds_load():
    p = Params(); inp = load_inputs()
    b = scenario_load(inp, "greensboro", p)
    assert scenario_load(inp, "greensboro", p, hp_frac=1.0).sum() > b.sum()
    assert scenario_load(inp, "greensboro", p, ev_frac=0.5).sum() > b.sum()
