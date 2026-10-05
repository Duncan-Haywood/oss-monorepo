"""CAD checks (skipped without CadQuery)."""
import math

import numpy as np
import pytest

cq = pytest.importorskip("cadquery")
shapely = pytest.importorskip("shapely")

from shapely import affinity  # noqa: E402
from shapely.geometry import Polygon  # noqa: E402

from homebot.cad.geom import gear_profile  # noqa: E402
from homebot.cad.parts import _rack_profile, grip_pinion, jaw, pad, pinion  # noqa: E402
from homebot.layout import ArmGeometry  # noqa: E402
from homebot.mjcf import load_mass_properties  # noqa: E402
from homebot.params import DEFAULT  # noqa: E402


@pytest.mark.parametrize("which", ["shoulder", "elbow"])
def test_gears_mesh_without_interference(which):
    g = DEFAULT.arm.shoulder_gear if which == "shoulder" else DEFAULT.arm.elbow_gear
    m = g.module * 1000
    P = Polygon(gear_profile(m, g.pinion_teeth, 0.3))
    if g.pinion_teeth % 2:  # odd tooth count: turn a tooth to face the gear (angle pi)
        P = affinity.rotate(P, math.pi / g.pinion_teeth, origin=(0, 0), use_radians=True)
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


def test_rack_meshes_with_gripper_pinion_over_the_stroke():
    """Pinion turns by s / r while the rack of the +x jaw slides by s: flanks never overlap
    and the rack stays engaged over the whole stroke."""
    g = DEFAULT.arm.gripper
    G = ArmGeometry(DEFAULT)
    r = g.pitch_radius * 1000
    P = Polygon(gear_profile(g.module * 1000, g.pinion_teeth, 0.3))
    rx0, rx1 = (v * 1000 for v in G.g_rack_x)
    rack = Polygon(_rack_profile(G, g, rx0, rx1))
    worst = 0.0
    for s in np.linspace(0, g.stroke * 1000, 81):
        # pinion turning +s/r about +z drives the -y rack toward +x
        Pk = affinity.rotate(P, s / r, origin=(0, 0), use_radians=True)
        Rk = affinity.translate(rack, s, 0)
        worst = max(worst, Pk.intersection(Rk).area)
        # teeth of the rack still under the pinion
        assert Rk.bounds[0] < -2 * math.pi * g.module * 1000 and Rk.bounds[2] > 2 * math.pi * g.module * 1000
    assert worst < 0.05


def test_elbow_and_gripper_clear_their_ranges():
    from homebot.cad.interference import sweep

    res = sweep(DEFAULT, joints=["elbow", "gripper"], n=5)
    for j, r in res.items():
        assert r["all_free"], (j, r["overlap_mm3"])


def test_small_parts_match_saved_mass_properties():
    props = load_mass_properties()
    for name, fn in (("pinion", pinion), ("grip_pinion", grip_pinion), ("jaw", jaw), ("pad", pad)):
        v = sum(s.Volume() for s in fn(DEFAULT).vals()) / 1000
        assert v == pytest.approx(props[name]["solid_volume_cm3"], rel=0.01)
