import math
from house_dewpoint import Layer, psat, wall_profile, condensation, build_wall, CLIMATES


def test_psat_anchors():
    assert abs(psat(0) - 611) < 2
    assert abs(psat(100) - 101325) / 101325 < 0.05  # Magnus form drifts at the top of its range
    assert abs(psat(20) - 2339) / 2339 < 0.01


def test_temperature_linear_in_r():
    ls = [Layer("a", 1.0, 10), Layer("b", 3.0, 10)]
    t, _, _ = wall_profile(ls, 20, 0.3, 0, 0.3)
    drops = [t[0] - t[1], t[1] - t[2]]
    assert abs(drops[1] / drops[0] - 3.0) < 1e-9


def test_no_condensation_when_dry():
    ls = build_wall("paint", "none")
    r = condensation(ls, 21, 0.2, 10, 0.3)
    assert r["total"] == 0 and all(x == 0 for x in r["rates"])


def test_single_plane_mass_balance():
    ls = [Layer("tight in", 1.0, 0.1), Layer("cold", 2.0, 5.0), Layer("tight out", 0.0, 0.1)]
    r = condensation(ls, 21, 0.5, -10, 0.8)
    assert r["total"] >= 0
    # rates are net: flux in minus flux out at clamped nodes, and no node is left over-saturated
    assert all(x >= -1e-9 for x in r["rates"])


def test_vapor_reaches_saturation_gives_positive_rate():
    # vapor-tight outer layer, open inner layer: interface behind it is cold and wet
    ls = [Layer("open", 0.5, 100.0), Layer("cold", 3.0, 100.0), Layer("tight", 0.0, 0.05)]
    r = condensation(ls, 21, 0.6, -15, 0.8)
    assert r["rates"][2] > 0
    assert r["rates"][1] == 0


def test_poly_worse_than_paint_in_summer_miami_inward_drive():
    ps = CLIMATES["Miami (1A)"]["summer"]
    paint = condensation(build_wall("paint", "none"), *ps)["total"]
    poly = condensation(build_wall("poly", "none"), *ps)["total"]
    assert poly >= paint


def test_exterior_foam_reduces_winter_condensation_chicago():
    w = CLIMATES["Chicago (5A)"]["winter"]
    a = condensation(build_wall("kraft", "none"), *w)["total"]
    b = condensation(build_wall("kraft", "xps2"), *w)["total"]
    assert b <= a


def test_poly_stops_winter_condensation_in_duluth_vs_paint():
    w = CLIMATES["Duluth (7A)"]["winter"]
    paint = condensation(build_wall("paint", "none"), *w)["total"]
    poly = condensation(build_wall("poly", "none"), *w)["total"]
    assert paint > poly
