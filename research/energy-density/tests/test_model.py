import math
import pytest
from energy_density import (composition, molar_mass, couple_row, specific_energy, PUBLISHED,
                            flow_battery_wh_per_l, sensible_heat, sensible_exergy, latent_cold_exergy,
                            gravity_wh_per_kg, flywheel_wh_per_kg, sphere_shell_mass_per_volume,
                            isothermal_air_exergy_wh_per_l, ev_per_atom_from_wh_kg,
                            wh_kg_from_ev_per_atom, WH_PER_MOL_V)


def test_formula_parser():
    assert composition("Al(OH)3") == {"Al": 1, "O": 3, "H": 3}
    assert composition("Li0.5CoO2") == {"Li": 0.5, "Co": 1, "O": 2}
    assert molar_mass("H2SO4") == pytest.approx(98.07, abs=0.01)
    with pytest.raises(ValueError):
        composition("Li)2")


def test_faraday_per_volt():
    # 1 mol of electrons through 1 V is 26.8 Wh
    assert WH_PER_MOL_V == pytest.approx(26.801, abs=1e-3)


@pytest.mark.parametrize("key,field,pub_key,tol", [
    ("lead_acid", "wh_kg", "lead_acid", 0.005),
    ("li_s", "wh_kg", "li_s", 0.001),
    ("zn_air", "wh_kg", "zn_air", 0.002),
    ("al_air", "wh_kg_metal", "al_air_metal", 0.005),
    ("li_o2", "wh_kg", "li_o2", 0.001),
])
def test_reproduces_published_theoretical_values(key, field, pub_key, tol):
    assert couple_row(key)[field] == pytest.approx(PUBLISHED[pub_key][0], rel=tol)


def test_lead_acid_at_two_volts_is_167():
    reactants = [(1, "Pb"), (1, "PbO2"), (2, "H2SO4")]
    assert specific_energy(reactants, 2, 2.0) == pytest.approx(167, abs=0.5)


def test_per_atom_identity():
    for key in ("lead_acid", "li_s", "li_o2", "zn_air"):
        r = couple_row(key)
        assert wh_kg_from_ev_per_atom(r["ev_atom"], r["mean_m"]) == pytest.approx(r["wh_kg"], rel=1e-9)
        assert ev_per_atom_from_wh_kg(r["wh_kg"], r["mean_m"]) == pytest.approx(r["ev_atom"], rel=1e-9)


def test_no_couple_exceeds_1p7_ev_per_atom():
    # the finding in the README: the spread in Wh/kg comes from atomic mass, not eV per atom
    from energy_density import COUPLES
    assert max(couple_row(k)["ev_atom"] for k, *_ in COUPLES) < 1.7


def test_flow_battery():
    assert flow_battery_wh_per_l(1.6, 1.26) == pytest.approx(27.0, abs=0.05)


def test_thermal():
    assert sensible_heat(4.18, 298.15, 358.15) == pytest.approx(69.67, abs=0.01)
    # exergy below heat, and zero for a store at ambient
    assert sensible_exergy(0.8, 293.15, 773.15) < sensible_heat(0.8, 293.15, 773.15)
    assert sensible_exergy(1.0, 293.15, 293.15) == 0
    # a small temperature lift is nearly worthless as electricity
    assert sensible_exergy(1.0, 293.15, 303.15) / sensible_heat(1.0, 293.15, 303.15) < 0.02
    assert latent_cold_exergy(334, 273.15, 273.15) == 0
    with pytest.raises(ValueError):
        sensible_exergy(1.0, 250.0, 300.0)


def test_mechanical():
    assert gravity_wh_per_kg(367.1) == pytest.approx(1.0, abs=1e-3)
    assert flywheel_wh_per_kg(3.6e6, 1.0, 1.0) == pytest.approx(1000.0)
    # thin sphere: t = p r / 2 sigma, m = 4 pi r^2 t rho, V = 4/3 pi r^3
    p, s, rho, r = 1e7, 1e9, 2000.0, 0.3
    t = p * r / (2 * s)
    direct = 4 * math.pi * r ** 2 * t * rho / (4 / 3 * math.pi * r ** 3)
    assert sphere_shell_mass_per_volume(p, s, rho) == pytest.approx(direct)


def test_compressed_air():
    assert isothermal_air_exergy_wh_per_l(101325.0) == pytest.approx(0.0, abs=1e-12)
    w200, w300 = isothermal_air_exergy_wh_per_l(200e5), isothermal_air_exergy_wh_per_l(300e5)
    assert 0 < w200 < w300
