import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_buckle15 import eigbuckle as eb

L, W, B = 72.0, 8.0, 2.0


def test_euler_column_matches_to_2_percent():
    lam = eb.critical_loads(L, W, B, "axial", 18, 2, 1, k=1)[0]
    assert abs(lam / eb.closed_forms(L, W, B, "axial") - 1) < 0.02


def test_moment_ltb_within_5_percent_at_1p5mm():
    lam = eb.critical_loads(80.0, 18.4, 1.5, "moment", 18, 2, 1, k=1)[0]
    assert abs(lam / eb.closed_forms(80.0, 18.4, 1.5, "moment") - 1) < 0.05


def test_closed_form_ordering():
    assert eb.closed_forms(80.0, 18.4, 1.5, "moment") < eb.closed_forms(80.0, 18.4, 2.0, "moment")
