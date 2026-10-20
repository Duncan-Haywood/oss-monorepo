import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_revwidth import sweep as sw


def test_area_and_mass():
    assert abs(sw.area(18.4) - (80 * 18.4 + (80 - 18.4) * 18.4)) < 1e-9
    assert sw.mass_g(18.4) > 0 and sw.mass_g(24) > sw.mass_g(18.4)


def test_find_width_on_known_function():
    w, hist = sw.find_width(3.0, 10, 30, lambda w: w / 5.0, tol=1e-3)
    assert abs(w - 15.0) < 2e-3 and len(hist) > 2


def test_find_width_unbracketed_raises():
    try:
        sw.find_width(9.0, 1, 2, lambda w: w)
    except ValueError:
        return
    assert False


def test_coarse_factor_matches_lbuckle_reversed():
    # simdesign-lbuckle reports 2.267 for the reversed load on this mesh
    assert abs(sw.factor(18.4, mesh=(2, 18, 14, 1)) - 2.267) < 0.005
