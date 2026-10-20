"""Strength of the hub joint, from beam statics. Every constant is an assumption (README).

The arm's root moment M = F * lever (F and the lever are hanger-print's) is carried across the lap
by a couple of horizontal bolt forces Fb = M / spacing at the two bolt centres. Contact between the
flat hub faces would take part of it; it is ignored, so the joint is checked bolts-only. The
critical bolt pushes its boss toward the free edge, so the boss can tear out there. Checks:
  bearing  Fb / (bolt_d * t)             against the PLA bearing stress
  tear-out Fb / (2 t (boss_r - hole/2))  against the in-plane shear stress (two planes)
  net      Fb / (2 t (boss_r - hole/2))  is the same area, against tension, with a hole Kt
  bolt     Fb / (pi d^2 / 4)             against the bolt's shear stress (single shear)
t is the boss thickness, depth / 2. `creep` multiplies every PLA allowable (steady load).
"""
import math

from hanger_print import strength as S

BEARING_MPA = 30.0      # PLA bearing allowable (assumed)
SHEAR_MPA = 15.0        # PLA in-plane shear allowable, for tear-out (assumed)
TENSION_MPA = 40.0      # as hanger-print's allowable
KT_HOLE = 2.5           # tension stress concentration at a hole (assumed)
BOLT_SHEAR_MPA = 150.0  # steel class 8.8 allowable in single shear with margin (assumed)
PEG_SHEAR_MPA = 12.0    # printed peg (axis through the layers: shear along them), assumed


def root_moment(d, mass_kg=S.MASS_KG):
    return S.arm_load_N(mass_kg) * S.lever_mm(d)


def bolt_force(d, j, mass_kg=S.MASS_KG):
    return root_moment(d, mass_kg) / j.spacing


def checks(d, j, creep=1.0, peg=False, mass_kg=S.MASS_KG):
    """Safety factors by mode and the governing one. `peg` swaps the steel bolt for a printed peg
    of the same diameter (no hardware); the peg shears along its layers."""
    fb = bolt_force(d, j, mass_kg)
    t = d.depth / 2.0
    lig = 2.0 * t * (j.boss_r - j.hole_d / 2.0)
    sf = {"bearing": creep * BEARING_MPA / (fb / (j.bolt_d * t)),
          "tearout": creep * SHEAR_MPA / (fb / lig),
          "net": creep * TENSION_MPA / (KT_HOLE * fb / lig),
          "bolt": (creep if peg else 1.0) * (PEG_SHEAR_MPA if peg else BOLT_SHEAR_MPA) / (fb / (math.pi * j.bolt_d ** 2 / 4.0))}
    gov = min(sf, key=sf.get)
    return sf, gov, sf[gov]


def joint_mass_g(d, j):
    """Extra PLA of the three bosses against the one-piece hub: the two bolt bosses, solid, per half."""
    a = 2 * (math.pi * (j.boss_r ** 2 - (j.hole_d / 2) ** 2))
    return a * d.depth / 2.0 * S.RHO
