import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_revwidth import sweep as sw


def test_area_and_mass():
    assert abs(sw.area(18.4) - (80 * 18.4 + (80 - 18.4) * 18.4)) < 1e-9
    assert sw.mass_g(18.4) > 0 and sw.mass_g(24) > sw.mass_g(18.4)


def test_find_width_on_known_function():
    w, hist = sw.find_width(3.0, 10, 30, lambda w: w / 5.0, tol=1e-3)
    assert abs(w - 15.0) < 2e-3 and len(hist) > 2
    assert w / 5.0 >= 3.0  # the returned width must meet the target, not just lie near it


def test_find_width_step_function_meets_target():
    f = lambda w: 3.0 if w >= 15 else 2.0
    w, _ = sw.find_width(3.0, 10, 30, f, tol=1e-3)
    assert f(w) >= 3.0 and w - 15 < 1e-3


def test_mass_pinned_to_reported_values():
    # steel 7.85 g/cm^3, 1.5 mm sheet, 80 x 80 mm L: hand-computed 30.68 g and 36.59 g (README table)
    assert abs(sw.mass_g(18.4) - 30.68) < 0.01
    assert abs(sw.mass_g(22.619) - 36.59) < 0.01


def test_find_width_unbracketed_raises():
    try:
        sw.find_width(9.0, 1, 2, lambda w: w)
    except ValueError:
        return
    assert False


def test_coarse_factor_matches_lbuckle_reversed():
    # simdesign-lbuckle reports 2.267 for the reversed load on this mesh
    assert abs(sw.factor(18.4, mesh=(2, 18, 14, 1)) - 2.267) < 0.005
