import pandapower as pp
import pytest

from infra_dcopf import load_case, gen_cost, solve_ac, solve_dc, compare, scaled, loss_adjusted_dc, ac_check_of_dispatch


def two_bus(load=50.0):
    """Slack at bus 0 (cost 10 + 0.01 p^2 per MW), a 50 MW load at bus 1 on one lossy line."""
    n = pp.create_empty_network()
    b0 = pp.create_bus(n, 110.0, min_vm_pu=0.9, max_vm_pu=1.1)
    b1 = pp.create_bus(n, 110.0, min_vm_pu=0.9, max_vm_pu=1.1)
    pp.create_ext_grid(n, b0, vm_pu=1.0, max_p_mw=500, min_p_mw=0, max_q_mvar=500, min_q_mvar=-500)
    pp.create_load(n, b1, p_mw=load, q_mvar=0.0)
    pp.create_line_from_parameters(n, b0, b1, 10.0, r_ohm_per_km=0.2, x_ohm_per_km=0.4, c_nf_per_km=0.0,
                                   max_i_ka=1.0, max_loading_percent=100.0)
    pp.create_poly_cost(n, 0, "ext_grid", cp1_eur_per_mw=10.0, cp2_eur_per_mw2=0.01, cp0_eur=0.0)
    return n


def test_dc_matches_analytic_lossless_cost():
    # DC has no losses, so the slack supplies exactly the load: 10*50 + 0.01*50^2 = 525
    dc = solve_dc(two_bus())
    assert dc.res_cost == pytest.approx(525.0, rel=1e-4)


def test_ac_pays_for_losses_that_dc_ignores():
    ac, dc = solve_ac(two_bus()), solve_dc(two_bus())
    assert ac.res_cost > dc.res_cost
    loss = float(ac.res_line.pl_mw.sum())
    assert loss > 0
    assert ac.res_ext_grid.p_mw.sum() == pytest.approx(50.0 + loss, rel=1e-4)


def test_gen_cost_reproduces_pandapower_cost_on_ieee39():
    n = solve_ac(load_case("case39"))
    mine = gen_cost(n, n.res_gen.p_mw.values, float(n.res_ext_grid.p_mw.sum()))
    assert mine == pytest.approx(n.res_cost, rel=1e-6)


def test_dc_dispatch_costs_no_less_than_ac_optimum_when_it_respects_the_limits():
    r = compare(load_case("case118"), 1.0)
    assert r["dc_in_ac"]["converged"]
    assert r["dc_in_ac"]["n_bus_v_viol"] == 0 and r["dc_in_ac"]["n_line_over"] == 0
    assert r["dc_in_ac"]["cost"] >= r["ac_cost"] * (1 - 1e-6)


def test_dc_cost_underestimates_ieee118():
    r = compare(load_case("case118"), 1.0)
    assert r["dc_cost"] < r["ac_cost"]
    assert 0.01 < (r["ac_cost"] - r["dc_cost"]) / r["ac_cost"] < 0.05


def test_case39_dc_dispatch_breaks_voltage_limits_at_light_load():
    r = compare(load_case("case39"), 0.6)
    assert r["dc_in_ac"]["n_bus_v_viol"] > 0


def test_loss_adjusted_dc_model_cost_is_closer_to_ac_than_plain_dc_on_ieee118():
    n = load_case("case118")
    ac, dc = solve_ac(n), solve_dc(n)
    adj, hist = loss_adjusted_dc(n)
    assert hist and hist[-1] > 50.0  # the losses it fed back are real, tens of MW
    assert abs(adj.res_cost - ac.res_cost) < 0.5 * abs(dc.res_cost - ac.res_cost)


def test_loss_adjusted_dc_on_two_bus_covers_the_line_loss():
    n = two_bus()
    adj, hist = loss_adjusted_dc(n)
    chk = ac_check_of_dispatch(n, adj)
    assert chk["converged"] and chk["losses_mw"] == pytest.approx(hist[-1], abs=0.1)
    assert adj.res_cost >= solve_dc(n).res_cost  # losses add load, never remove it
