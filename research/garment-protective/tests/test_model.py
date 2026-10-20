import math, pytest
from garment_protective.model import *

A, U, N = FIBRES[1], FIBRES[2], FIBRES[0]

def test_u_star_hand_value():
    f = Fibre("x", 2e9, 0.02, 64e9, 1000, 1)
    # (2e9*0.02/2000)=2e4; sqrt(64e6)=8e3 -> 1.6e8 ; cube root
    assert u_star(f) == pytest.approx(1.6e8 ** (1 / 3))

def test_ref_ratios_are_one():
    assert v50_ratio(A, A) == 1 and areal_density_ratio(A, A, 0.5) == 1

def test_ordering_aramid_pe_beat_nylon():
    assert u_star(A) > u_star(N) and u_star(U) > u_star(N)

def test_equal_threat_inverse_consistency():
    r = areal_density_ratio(U, A, 0.5)
    assert r ** 0.5 == pytest.approx(1 / v50_ratio(U, A))

def test_bad_exponent():
    with pytest.raises(ValueError):
        areal_density_ratio(U, A, 0)

def test_thickness_scaling():
    assert thickness(A, 2.0) == pytest.approx(2 * thickness(A, 1.0))

def test_free_plies_more_flexible_than_bonded():
    b = bending_stiffness(A, 4.0, 20, True)
    assert bending_stiffness(A, 4.0, 20, False) == pytest.approx(b / 20**2)

def test_garment_cost_mass():
    g = garment(A, 2.0, 0.5)
    assert g["mass_kg"] == 1.0 and g["cost_usd"] == pytest.approx(40.0)
