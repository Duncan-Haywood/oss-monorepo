"""marine_hull's closed-form Michell Cw agrees with an independent fine integral (milestone 3m)."""
import math

import numpy as np
import pytest

from marine_hull.michell import G, wave_resistance_wigley

L, B, T, RHO = 1.0, 0.1, 0.0625, 1000.0


def _fine(fn, n_l=1501, n_x=2001, n_z=1001, depth=100.0):
    """Original Michell integral in the lambda = 1 + w^2 form, dense trapezoid grids."""
    u = fn * math.sqrt(G * L)
    k0 = G / u ** 2
    w = np.sqrt(np.sqrt(depth / (k0 * T)) + 1.0) * np.linspace(0, 1, n_l)
    lam = 1.0 + w ** 2
    x = np.linspace(-L / 2, L / 2, n_x)
    z = np.linspace(-T, 0, n_z)
    sx, sz = -B / 2 * 8 * x / L ** 2, 1 - (z / T) ** 2
    amp = np.array([(np.trapezoid(sx * np.sin(li * k0 * x), x) * np.trapezoid(sz * np.exp(li ** 2 * k0 * z), z)) ** 2
                    for li in lam])
    wt = lam ** 2 / np.sqrt(lam + 1.0) * 2.0
    return 4 * RHO * G ** 2 / (math.pi * u ** 2) * np.trapezoid(amp * wt, w)


@pytest.mark.parametrize("fn", [0.2, 0.3, 0.5])
def test_module_matches_fine_integral_within_half_percent(fn):
    u = fn * math.sqrt(G * L)
    mod = wave_resistance_wigley(u, L, B, T, rho=RHO)
    assert abs(mod / _fine(fn) - 1) < 0.005
