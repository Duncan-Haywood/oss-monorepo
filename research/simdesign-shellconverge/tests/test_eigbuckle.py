import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_shellconverge import eigbuckle as eb

L, W, B = 72.0, 8.0, 2.0


def test_euler_column_matches_to_2_percent():
    """Checks the geometric-stiffness assembly on the textbook clamped-free column (weak axis)."""
    lam = eb.critical_loads(L, W, B, "axial", 18, 2, 1, k=1)[0]
    assert abs(lam / eb.closed_forms(L, W, B, "axial") - 1) < 0.02


def test_refining_through_thickness_lowers_the_critical_load():
    """Stiffness-based FE overestimates; a second layer through b should not raise the eigenvalue."""
    coarse = eb.critical_loads(L, W, B, "shear", 12, 2, 1, k=1)[0]
    fine = eb.critical_loads(L, W, B, "shear", 12, 2, 2, k=1)[0]
    assert fine < coarse
    assert fine > 0.8 * coarse
