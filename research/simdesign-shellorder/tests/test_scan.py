import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_shellorder import eigbuckle as eb


def test_coarse_levels_decrease_toward_closed_form():
    """On the short bar, the two coarsest uniform levels give decreasing critical loads."""
    a = eb.critical_loads(24.0, 8.0, 2.0, "shear", 6, 2, 1, k=1)[0]
    b = eb.critical_loads(24.0, 8.0, 2.0, "shear", 12, 4, 2, k=1)[0]
    assert b < a
    assert b > 0.5 * a
