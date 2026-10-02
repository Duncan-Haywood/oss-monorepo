"""CAD checks (skipped without CadQuery)."""
import math

import pytest

cq = pytest.importorskip("cadquery")
shapely = pytest.importorskip("shapely")

from shapely import affinity  # noqa: E402
from shapely.geometry import Polygon  # noqa: E402

from homebot.cad.geom import gear_profile  # noqa: E402
from homebot.cad.parts import jaw, pinion  # noqa: E402
from homebot.mjcf import load_mass_properties  # noqa: E402
from homebot.params import DEFAULT  # noqa: E402


def test_gears_mesh_without_interference():
    g = DEFAULT.arm.shoulder_gear
    m = g.module * 1000
    P = Polygon(gear_profile(m, g.pinion_teeth, 0.3))
    G = Polygon(gear_profile(m, g.gear_teeth, -0.3))
    C = g.centre_distance * 1000
    # phase the gear so that a pinion tooth points into a gear gap at angle 0
    G = affinity.rotate(G, math.pi + math.pi / g.gear_teeth, origin=(0, 0), use_radians=True)
    worst = 0.0
    for k in range(60):
        a = k * 2 * math.pi / g.pinion_teeth / 60
        Pk = affinity.translate(affinity.rotate(P, a, origin=(0, 0), use_radians=True), C, 0)
        Gk = affinity.rotate(G, -a / g.ratio, origin=(0, 0), use_radians=True)
        worst = max(worst, Pk.intersection(Gk).area)
    assert worst < 0.05  # mm^2: backlash keeps the flanks apart


def test_small_parts_match_saved_mass_properties():
    props = load_mass_properties()
    for name, fn in (("pinion", pinion), ("jaw", jaw)):
        v = sum(s.Volume() for s in fn(DEFAULT).vals()) / 1000
        assert v == pytest.approx(props[name]["solid_volume_cm3"], rel=0.01)
