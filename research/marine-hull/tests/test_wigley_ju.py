"""Ju (1983) Wigley point as quoted by Wang et al. (2017): internal consistency, milestone 3o."""
import math

from marine_hull.hull import cf_ittc57
from marine_hull.michell import G, wave_resistance_wigley, wigley_wetted

L, B, T = 4.0, 0.4, 0.25


def test_quoted_area_matches_exact_wigley_surface():
    assert abs(0.661 * L * (2 * T + B) / wigley_wetted(L, B, T) - 1) < 0.001


def test_quoted_speed_is_fn_0p267():
    assert abs(1.67 - 0.267 * math.sqrt(G * L)) < 0.005


def test_implied_form_factor_is_small_at_any_tank_temperature():
    for rho, nu in [(999.7, 1.307e-6), (997.0, 0.893e-6)]:
        u = 0.267 * math.sqrt(G * L)
        q = 0.5 * rho * u * u * wigley_wetted(L, B, T)
        cw = wave_resistance_wigley(u, L, B, T, rho=rho) / q
        k = (4.16e-3 - cw) / cf_ittc57(u * L / nu) - 1
        assert -0.1 < k < 0.05
