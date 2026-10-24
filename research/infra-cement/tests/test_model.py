from infra_cement import *


def test_calcination_stoichiometry():
    # 44.009/56.077 = 0.7848 t CO2 per t CaO; at 65% CaO about 510 kg
    assert abs(calcination_kgCO2_per_t_clinker(1.0) - 784.8) < 0.5
    assert abs(calcination_kgCO2_per_t_clinker(0.65) - 510.1) < 0.5


def test_kaolinite_mass_loss():
    assert abs(dehydroxylation_mass_loss() - 0.1396) < 0.001


def test_blends_sum_to_one():
    for b in BLENDS:
        assert abs(b.total() - 1) < 1e-9


def test_opc_in_published_range():
    # published world averages are about 600 to 900 kg CO2/t cement; this one-plant balance should sit inside
    assert 700 < balance(BLENDS[0])["total"] < 900


def test_co2_falls_with_clinker_factor_at_zero_scm_cost():
    zero = {"slag_kgCO2_per_t": 0, "limestone_kgCO2_per_t": 0, "clay_calcination_GJ_per_t": 0, "gypsum_kgCO2_per_t": 0}
    a, b = balance(BLENDS[0], zero)["total"], balance(BLENDS[5], zero)["total"]
    assert b < a
    # with free SCMs, the calcination+fuel share scales with the clinker content
    ratio = (balance(BLENDS[5], zero)["calcination"]) / balance(BLENDS[0], zero)["calcination"]
    assert abs(ratio - 0.5 / 0.95) < 1e-9


def test_lc3_strength_interpolation_and_monotone():
    assert abs(lc3_relative_strength(0.5) - 0.82) < 1e-9
    assert abs(lc3_relative_strength(0.8) - 0.988) < 1e-9
    xs = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
    ys = [lc3_relative_strength(x) for x in xs]
    assert ys == sorted(ys) and ys[-1] <= 1.0


def test_min_clinker_for_class():
    # a 50 MPa OPC reference needs 42.5/50 = 0.85 relative: reached between 0.5 and 0.6 clinker
    c = min_clinker_for_class(50, "42.5")
    assert c is not None and 0.5 < c < 0.62
    assert min_clinker_for_class(42.6, "42.5") is not None
    assert min_clinker_for_class(40, "42.5") is None
