import math
from infra_grind import *

P = {**DEFAULTS}


def test_feed_is_normalised_with_requested_d80():
    f = feed(P)
    assert abs(sum(f) - 1) < 1e-9
    assert abs(percentile_size(f, P) - 1500) / 1500 < 0.08  # sqrt2 ladder interpolation


def test_breakage_columns_sum_to_one():
    b = breakage(P)
    for j in range(P["n"] - 1):
        assert abs(sum(b[i][j] for i in range(P["n"])) - 1) < 1e-9


def test_mill_conserves_mass_and_moves_it_finer():
    f = feed(P)
    for E in (1, 10, 100):
        out = mill_pass(f, E, P)
        assert abs(sum(out) - 1) < 1e-9
    assert percentile_size(mill_pass(f, 10, P), P) < percentile_size(f, P)
    assert percentile_size(mill_pass(f, 100, P), P) < percentile_size(mill_pass(f, 10, P), P)


def test_first_order_breakage_of_a_single_class_analytic():
    # one class, no progeny to track: a single tank leaves 1/(1+eS) of the top class
    f = [0.0] * P["n"]; f[0] = 1.0
    p = {**P, "tanks": 1}
    out = mill_pass(f, 5.0, p)
    assert abs(out[0] - 1 / (1 + 5.0 * selection(p)[0])) < 1e-12


def test_more_tanks_means_less_overgrinding_of_the_same_feed():
    # plug-flow-like mills narrow the residence-time spread: same P80 costs less energy
    assert energy_open(100, {"tanks": 6}) < energy_open(100, {"tanks": 1})


def test_closed_circuit_mass_balance_and_load():
    r = closed_circuit(8.0, 100.0)
    assert abs(sum(r["product"]) - 1) < 1e-9
    assert r["circ_load"] > 0
    assert abs(r["energy"] - 8.0 * (1 + r["circ_load"])) < 1e-9


def test_closed_circuit_beats_open_at_same_p80():
    eo = energy_open(100)
    ec = energy_closed(100, 1.25)
    assert abs(ec["p80"] - 100) < 1.0
    assert ec["energy"] < eo


def test_finer_cut_raises_circulating_load():
    assert energy_closed(100, 0.9)["circ_load"] > energy_closed(100, 1.5)["circ_load"]


def test_bond_formula_known_value():
    # 10*Wi*(1/sqrt(100) - 1/sqrt(1500)) for Wi=13 is 9.64 kWh/t
    assert abs(bond_energy(13, 100, 1500) - 9.64) < 0.01


def test_energy_scales_inversely_with_S1():
    a = energy_open(100, {"S1": 0.35}); b = energy_open(100, {"S1": 0.70})
    assert abs(a / b - 2) < 1e-6


def test_fines_slowing_off_is_default_and_raises_energy_when_on():
    base = energy_open(100)
    assert abs(base - energy_open(100, {"xfine": 0.0})) < 1e-9
    assert energy_open(100, {"xfine": 60.0, "kfine": 1.0}) > base


def test_fines_slowing_never_speeds_a_class():
    a = selection({**DEFAULTS}); b = selection({**DEFAULTS, "xfine": 60.0})
    assert all(y <= x + 1e-12 for x, y in zip(a, b))


def test_capacity_ratio_is_power_limited_when_flow_is_ample_and_flow_limited_when_tight():
    closed = {"energy": 20.0, "circ_load": 2.0}
    assert capacity_ratio(40.0, closed, 100.0) == 2.0   # E_open / E_closed
    assert abs(capacity_ratio(40.0, closed, 1.5) - 0.5) < 1e-12  # m / (1 + load)
    assert capacity_ratio(40.0, closed, 3.0) == 1.0     # both equal at m = 3
