import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_fwdcheck import check as ck


def test_nominal_stress_matches_hand_calculation():
    # w = 10, b = 2: axial 100/20 = 5; bending 100*75*5/(2*1000/12) = 225
    assert abs(ck.nominal_stress(10.0, 2.0) - 230.0) < 1e-9


def test_von_mises_of_uniaxial_state():
    import numpy as np
    s = np.zeros((3, 3, 1)); s[0, 0] = 50.0
    assert abs(ck.von_mises(s)[0] - 50.0) < 1e-9


def test_wider_plate_is_less_stressed_and_stiffer():
    a = ck.static(10.0, 2.0)
    c = ck.static(14.0, 2.0)
    assert c[0] < a[0] and c[2] < a[2]
