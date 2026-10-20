"""Beam checks for a flat-printed hanger. Every constant is an assumption, listed in README.

The arm is a cantilever of rectangular section (2r thick in the frontal plane, `depth` front to
back) loaded in the frontal plane at its tip by half the garment's weight, times a dynamic factor
for the robot's motion. Printed flat, the bending stresses run along the layers, so the in-plane
strength applies, not the weaker layer-to-layer one.
"""
import math

from . import geom

G = 9.81
E_MPA = 3500.0          # PLA flexural modulus, N/mm^2 (typical datasheet value, assumed)
SIGMA_MPA = 40.0        # allowable in-plane stress for printed PLA, N/mm^2 (conservative, assumed)
KT = 2.0                # stress concentration at the arm root where it meets the hub (assumed)
DYNAMIC = 2.0           # robot acceleration and swing (assumed)
RHO = 1.24e-3           # PLA density, g/mm^3
MASS_KG = 1.5           # heaviest garment the hanger should carry (assumed)


def arm_load_N(mass_kg=MASS_KG):
    return mass_kg * G * DYNAMIC / 2.0


def lever_mm(d):
    return max(d.w - d.r, 0.5) * 10.0 * math.cos(math.radians(d.slope))


def root_stress(d, mass_kg=MASS_KG):
    """Peak bending stress (N/mm^2) at the arm root, with the stress concentration."""
    t = 2.0 * d.r * 10.0
    z = d.depth * t * t / 6.0
    return KT * arm_load_N(mass_kg) * lever_mm(d) / z


def safety_factor(d, mass_kg=MASS_KG):
    return SIGMA_MPA / root_stress(d, mass_kg)


def depth_for_sf(d, sf=3.0, mass_kg=MASS_KG):
    """Smallest front-to-back depth (mm) that reaches the safety factor."""
    t = 2.0 * d.r * 10.0
    return 6.0 * KT * arm_load_N(mass_kg) * lever_mm(d) * sf / (SIGMA_MPA * t * t)


def tip_deflection(d, mass_kg=MASS_KG):
    """Tip deflection (mm) of a straight cantilever of the same length, at the static load."""
    t = 2.0 * d.r * 10.0
    inertia = d.depth * t ** 3 / 12.0
    L = lever_mm(d)
    return (arm_load_N(mass_kg) / DYNAMIC) * L ** 3 / (3.0 * E_MPA * inertia)


def loop_stress(d, mass_kg=MASS_KG):
    """Tension (N/mm^2) in the two ligaments either side of the loop's hole."""
    lig = 2.0 * (geom.LOOP_RO - geom.LOOP_RI) * d.depth
    return mass_kg * G * DYNAMIC / lig


def solid_mass_g(shells_area_mm2, depth):
    return sum(shells_area_mm2) * depth * RHO


def sliced_mass_g(shells, depth, wall=0.8, infill=0.15):
    """Mass with two perimeters (0.8 mm), 0.8 mm top and bottom skins and sparse infill.
    Treats the shells as non-overlapping, so it is an upper bound where they overlap."""
    total = 0.0
    for s in shells:
        a = abs(geom.area(s["outline"])) - (abs(geom.area(s["hole"])) if "hole" in s else 0.0)
        pts = s["outline"]
        per = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
        if "hole" in s:
            h = s["hole"]
            per += sum(math.dist(h[i], h[(i + 1) % len(h)]) for i in range(len(h)))
        skin = 2 * wall * a
        walls = per * wall * max(depth - 2 * wall, 0.0)
        inner = max(a * depth - skin - walls, 0.0) * infill
        total += min(skin + walls + inner, a * depth)
    return total * RHO
