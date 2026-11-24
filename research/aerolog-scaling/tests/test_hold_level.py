import importlib.util
import math
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


hl = _mod("hold_level_test", "hold_level.py")
H5 = 120.0 / 9.0


def test_positions_between_levels_and_top_fallback():
    p = hl.positions(1, 0, 9)
    assert p == {"H0": 2.0, "HB": 1.5, "HA": 2.5}
    top = hl.positions(4, 1, 9)                     # level 9 is the top of a 5-band stack
    assert top["HA"] == top["HB"] == 8.5


def test_own_level_factor_is_half_per_heading():
    """At its own level a hovering drone meets half of a same-band operator's legs at gap 0 and half one level away."""
    f = hl.expo_factor(2, 4.0, H5, hl.LAM_Z, "normal")
    p0 = math.erf(hl.LAM_Z / (hl.SGAP * math.sqrt(2.0)))
    assert abs(f - 0.5 * p0) < 1e-12 * p0 + 1e-15


def test_between_levels_is_far_smaller_under_gaussian_than_laplace():
    own = hl.expo_factor(2, 4.0, H5, hl.LAM_Z, "normal")
    mid_n = hl.expo_factor(2, 4.5, H5, hl.LAM_Z, "normal")
    mid_l = hl.expo_factor(2, 4.5, H5, hl.LAM_Z, "laplace")
    assert mid_n < 1e-3 * own
    assert mid_n < mid_l < own


def test_los_factor_between_levels_counts_two_neighbours():
    """Half a level (6.67 m) is inside the 7.62 m minimum of both neighbouring levels."""
    own = hl.expo_factor(2, 4.0, H5, hl.Z, "normal")
    mid = hl.expo_factor(2, 4.5, H5, hl.Z, "normal")
    assert 0.45 < own < 0.55
    assert mid > own
