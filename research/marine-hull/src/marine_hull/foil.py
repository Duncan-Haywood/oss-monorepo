"""Foilborne drag of a small hydrofoil craft (milestone 5): lifting-line foil plus flat-plate struts.

Weight is carried by the foil: W = q S CL, q = rho V^2 / 2. Drag is
  foil   q S (CD0 + CL^2 / (pi e AR))        (Prandtl lifting line; CD0 is a section value, swept)
  struts q * n_s * 2 c h * cf(Re_c) * (1 + 2 t/c)   (both faces, ITTC 1957 friction, thickness form)
  junctions and spray: a multiplier `extra` on the strut and foil drag (swept)
Free-surface effects on the foil (ventilation, wave drag at shallow submergence) are not modelled.
"""
import math
from marine_hull.hull import G, RHO_SEA, NU_SEA, cf_ittc57


def foil_drag(v, mass, area, aspect, e=0.9, cd0=0.012, strut_chord=0.10, strut_draft=0.4,
              n_struts=2, t_over_c=0.12, extra=1.15, rho=RHO_SEA, nu=NU_SEA):
    """Return (drag N, CL). Needs CL > 0; the caller checks CL against CL_max."""
    q = 0.5 * rho * v * v
    cl = mass * G / (q * area)
    d_foil = q * area * (cd0 + cl * cl / (math.pi * e * aspect))
    cf = cf_ittc57(v * strut_chord / nu)
    d_strut = q * n_struts * 2.0 * strut_chord * strut_draft * cf * (1.0 + 2.0 * t_over_c)
    return extra * (d_foil + d_strut), cl
