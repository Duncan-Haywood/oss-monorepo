import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_revgauge import gauge as g


def test_mass_scales_with_gauge_and_width():
    assert abs(g.mass_g(20, 2.0) / g.mass_g(20, 1.0) - 2.0) < 1e-9
    assert g.mass_g(24, 1.5) > g.mass_g(20, 1.5)


def test_min_mass_row_on_known_function():
    w, m, hist = g.min_mass_row(2.0, lambda w: w / 4.0, 5, 20, tol=1e-3)
    assert abs(w - 12.0) < 2e-3 and abs(m - g.mass_g(w, 2.0)) < 1e-12


def test_floor_met_at_lower_bracket_returns_lower_bound():
    w, _, _ = g.min_mass_row(3.0, lambda w: 5.0, 8, 20)
    assert w == 8


def test_gauge_1p5_coarse_reproduces_revwidth():
    # simdesign-revwidth: 2.544 at w = 20 mm, b = 1.5 mm, coarse mesh
    assert abs(g.factor(20.0, 1.5) - 2.544) < 0.005
