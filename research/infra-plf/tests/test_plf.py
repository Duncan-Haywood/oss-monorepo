import numpy as np
import pandapower as pp
import pytest

from infra_plf import load_case, scaled, solve_ac, solve_dc, ac_eval, penalty_factors, plf_dc, uniform_dc


def two_gen(load=100.0):
    """Slack (bus 0) at the load bus 1 side is cheap but far; gen at bus 2 is dearer but adjacent to the load.
    Line 0-1 is lossy (long); line 2-1 is short."""
    n = pp.create_empty_network()
    b = [pp.create_bus(n, 110.0, min_vm_pu=0.9, max_vm_pu=1.1) for _ in range(3)]
    pp.create_ext_grid(n, b[0], vm_pu=1.0, max_p_mw=500, min_p_mw=0, max_q_mvar=500, min_q_mvar=-500)
    pp.create_gen(n, b[2], p_mw=0.0, vm_pu=1.0, max_p_mw=200, min_p_mw=0, max_q_mvar=200, min_q_mvar=-200, controllable=True)
    pp.create_load(n, b[1], p_mw=load, q_mvar=0.0)
    pp.create_line_from_parameters(n, b[0], b[1], 80.0, r_ohm_per_km=0.2, x_ohm_per_km=0.4, c_nf_per_km=0.0, max_i_ka=2.0, max_loading_percent=100.0)
    pp.create_line_from_parameters(n, b[2], b[1], 1.0, r_ohm_per_km=0.2, x_ohm_per_km=0.4, c_nf_per_km=0.0, max_i_ka=2.0, max_loading_percent=100.0)
    pp.create_poly_cost(n, 0, "ext_grid", cp1_eur_per_mw=10.0, cp2_eur_per_mw2=0.02, cp0_eur=0.0)
    pp.create_poly_cost(n, 0, "gen", cp1_eur_per_mw=10.5, cp2_eur_per_mw2=0.02, cp0_eur=0.0)
    return n


def test_far_generator_is_penalised_less_than_it_loses():
    n = two_gen()
    s = penalty_factors(n, np.array([50.0]))
    assert s.shape == (1,)
    assert s[0] < 0  # a gen next to the load relieves the long line, so more of it lowers losses


def test_plf_dispatch_beats_plain_dc_on_the_toy():
    # raw costs say slack (10) beats gen (10.5), but the slack's 80 km line loses MW; the PLF dispatch must lean on the near gen
    n = two_gen()
    ac, dc = solve_ac(n), solve_dc(n)
    sol, hist, s = plf_dc(n)
    plain = ac_eval(n, dc.res_gen.p_mw.values)["cost"]
    plf = ac_eval(n, sol.res_gen.p_mw.values)["cost"]
    assert plf < plain
    assert plf >= ac.res_cost * (1 - 1e-3)


def test_plf_on_case118_is_not_worse_than_plain_dc_under_ac():
    net = scaled(load_case("case118"), 1.0)
    ac, dc = solve_ac(net), solve_dc(net)
    sol, hist, s = plf_dc(net)
    plain = ac_eval(net, dc.res_gen.p_mw.values)["cost"]
    plf = ac_eval(net, sol.res_gen.p_mw.values)["cost"]
    assert plf <= plain * (1 + 1e-6)
    assert plf >= ac.res_cost * (1 - 1e-3)
