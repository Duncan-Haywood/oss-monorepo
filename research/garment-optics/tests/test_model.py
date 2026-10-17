import numpy as np
import pytest
from garment_optics.model import *


def test_sheet_se_known_values():
    assert se_sheet(Z0 / 2) == pytest.approx(20 * np.log10(2))
    assert se_sheet(rs_for_se(30.0)) == pytest.approx(30.0, abs=1e-9)


def test_resistance_scaling():
    r1 = yarn_resistance_per_m(1e6, 100e-6)
    assert yarn_resistance_per_m(1e6, 200e-6) == pytest.approx(r1 / 4)
    assert sheet_resistance(r1, 2e-3) == pytest.approx(2 * sheet_resistance(r1, 1e-3))


def test_aperture_falls_with_frequency():
    assert se_aperture(1e9, 1e-3) > se_aperture(10e9, 1e-3)
    assert se_aperture(2.4e9, 1e-3) == pytest.approx(20 * np.log10(C0 / 2.4e9 / 2e-3))


def test_combination_is_min():
    s = se_fabric(2.4e9, 10.0, 1e-3, 1e-4)
    assert s <= se_sheet(10.0 * 1e-3) + 1e-9 and s <= se_aperture(2.4e9, 9e-4) + 1e-9


def test_mass_scaling():
    assert metal_areal_mass(8000, 1e-4, 1e-3) == pytest.approx(2 * 8000 * np.pi * 1e-8 / 4 / 1e-3)


def test_grid_intact_matches_unit_square():
    rng = np.random.default_rng(0)
    assert effective_sheet_resistance(12, 0.0, rng) == pytest.approx(1.0, rel=1e-6)


def test_grid_breaks_raise_resistance_and_open_circuit():
    rng = np.random.default_rng(1)
    r = effective_sheet_resistance(12, 0.2, rng)
    assert 1.0 < r < np.inf
    assert effective_sheet_resistance(12, 1.0, rng) == np.inf


def test_breakage_tracks_effective_medium_below_threshold():
    rng = np.random.default_rng(2)
    r = np.median([effective_sheet_resistance(24, 0.2, rng) for _ in range(8)])
    assert r == pytest.approx(1 / (1 - 0.4), rel=0.15)
