import math
import pytest
from marine_hull.michell import _simpson, wave_resistance_wigley
from marine_hull.swath import spheroid_area, lobe_diameter, wave_resistance_lobes, swath_resistance, _j_lobe


def test_sphere_limit_area():
    assert spheroid_area(1.0, 1.0) == pytest.approx(math.pi)
    assert spheroid_area(1.0 + 1e-9, 1.0) == pytest.approx(math.pi, rel=1e-6)


def test_slender_area_hand_value():
    # L = 4, D = 0.4 spheroid: e = sqrt(1 - 0.01), S = 2 pi b^2 (1 + a asin(e)/(b e))
    a, b = 2.0, 0.2
    e = math.sqrt(1 - 0.01)
    assert spheroid_area(4.0, 0.4) == pytest.approx(2 * math.pi * b * b * (1 + a * math.asin(e) / (b * e)))


def test_lobe_volume_matches_numeric_integral():
    L, D = 4.0, lobe_diameter(0.05, 4.0)
    # cross-section area (pi/4) B D (1 - (2x/L)^2) with B = D integrates to the target volume
    v = _simpson(lambda x: math.pi / 4 * D * D * (1 - (2 * x / L) ** 2), -L / 2, L / 2, 200)
    assert v == pytest.approx(0.05, rel=1e-9)


def test_j_lobe_z_part_vs_direct_quadrature():
    u, L, D, h, th = 2.0, 4.0, 0.3, 0.6, 0.4
    a = (9.80665 / u ** 2) / math.cos(th) ** 2
    direct = _simpson(lambda z: math.sqrt(max(0.0, 1 - (2 * (z + h) / D) ** 2)) * math.exp(a * z), -h - D / 2, -h + D / 2, 4000)
    # recover jz from _j_lobe by dividing out the x part and the 0.5 D factor
    k0 = 9.80665 / u ** 2
    kx = k0 / math.cos(th)
    hh = kx * L / 2
    ix = 2 * (math.sin(hh) / kx ** 2 - L / 2 * math.cos(hh) / kx)
    jx = -8 / L ** 2 * ix
    assert _j_lobe(th, u, L, D, h) == pytest.approx(0.5 * D * jx * direct, rel=1e-4)


def test_wave_resistance_falls_with_depth():
    r1 = wave_resistance_lobes(2.0, 4.0, 0.3, 0.4, 0.8)
    r2 = wave_resistance_lobes(2.0, 4.0, 0.3, 0.9, 0.8)
    assert r1 > r2 > 0


def test_total_exceeds_viscous_and_share_in_unit_interval():
    r, share = swath_resistance(1.0, 0.2, 4.0, 2.0, 0.06, 0.5, 0.25, 0.2)
    assert r > 0 and 0 <= share < 1


def test_wscale_scales_only_wave_part():
    r1, _ = swath_resistance(2.5, 0.2, 4.0, 1.5, 0.06, 0.5, 0.25, 0.2, wscale=1.0)
    r0, _ = swath_resistance(2.5, 0.2, 4.0, 1.5, 0.06, 0.5, 0.25, 0.2, wscale=0.0)
    r2, _ = swath_resistance(2.5, 0.2, 4.0, 1.5, 0.06, 0.5, 0.25, 0.2, wscale=2.0)
    assert r2 - r1 == pytest.approx(r1 - r0, rel=1e-9)
