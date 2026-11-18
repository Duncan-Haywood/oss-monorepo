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


def test_von_mises_of_pure_shear_is_sqrt3_tau():
    # quality audit round 62: a seeded 3 -> 1 in the shear term left every test green
    import numpy as np
    s = np.zeros((3, 3, 1)); s[0, 1] = s[1, 0] = 40.0
    assert abs(ck.von_mises(s)[0] - 40.0 * np.sqrt(3)) < 1e-9


def test_nominal_stress_of_the_four_designs_matches_the_readme_table():
    # hand: F/(w b) + F (80 - w/2)(w/2) / (b w^3 / 12), rounded as in the table
    want = {1.5: 57.3, 2.0: 162.8, 2.5: 402.3, 3.0: 845.9}
    for b, w in ck.ROOTS.items():
        assert round(ck.nominal_stress(w, b), 1) == want[b]
