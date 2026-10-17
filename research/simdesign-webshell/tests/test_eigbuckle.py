import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_webshell import eigbuckle as eb

L, W, B = 72.0, 8.0, 2.0


def test_euler_column_matches_to_2_percent():
    """Checks the geometric-stiffness assembly on the textbook clamped-free column (weak axis)."""
    lam = eb.critical_loads(L, W, B, "axial", 18, 2, 1, k=1)[0]
    assert abs(lam / eb.closed_forms(L, W, B, "axial") - 1) < 0.02


def test_tip_load_ltb_within_15_percent_of_closed_form():
    lam = eb.critical_loads(L, W, B, "shear", 18, 2, 1, k=1)[0]
    assert 0.9 < lam / eb.closed_forms(L, W, B, "shear") < 1.15


def test_closed_forms_scale_as_expected():
    assert eb.closed_forms(L, 16.0, B, "shear") > eb.closed_forms(L, W, B, "shear")
