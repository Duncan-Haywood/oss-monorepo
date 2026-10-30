"""Planing-hull drag (milestone 5, planing rung): Savitsky (1964) prismatic planing surface.

Lift (Savitsky 1964, eqs. for a flat plate and deadrise correction):
  CL0 = tau^1.1 (0.012 lam^0.5 + 0.0055 lam^2.5 / Cv^2)      tau in degrees, lam = mean wetted length / beam
  CLb = CL0 - 0.0065 beta CL0^0.6                              beta = deadrise in degrees
  W   = CLb * rho/2 * V^2 * b^2,   Cv = V / sqrt(g b)
Drag: D = W tan(tau) + Df / cos(tau), Df = Cf rho/2 V^2 lam b^2 / cos(beta)  (ITTC 1957 friction on the
wetted bottom, speed taken as V; Savitsky's mean-bottom-speed correction is not applied).
Trim is not balanced against an LCG: the caller takes the best trim, a lower bound on drag.
Spray drag, appendage and air drag, and the hump region (Cv below about 1) are not modelled.
Savitsky's stated range: Cv 1 to 25, lam to 4, tau 2 to 15 deg, beta to 30 deg.
"""
import math
from marine_hull.hull import G, RHO_SEA, NU_SEA, cf_ittc57


def lift_force(v, beam, lam, tau_deg, beta_deg, rho=RHO_SEA):
    cv = v / math.sqrt(G * beam)
    cl0 = tau_deg ** 1.1 * (0.012 * lam ** 0.5 + 0.0055 * lam ** 2.5 / cv ** 2)
    clb = cl0 - 0.0065 * beta_deg * cl0 ** 0.6
    return clb * 0.5 * rho * v * v * beam * beam


def wetted_length_ratio(v, mass, beam, tau_deg, beta_deg, lam_max=4.0, rho=RHO_SEA):
    """lam with lift = weight at this trim, or None if no lam in (0.05, lam_max] carries it."""
    w = mass * G
    lo, hi = 0.05, lam_max
    if lift_force(v, beam, hi, tau_deg, beta_deg, rho) < w or lift_force(v, beam, lo, tau_deg, beta_deg, rho) > w:
        return None
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if lift_force(v, beam, mid, tau_deg, beta_deg, rho) < w:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def planing_drag(v, mass, beam, tau_deg, beta_deg, rho=RHO_SEA, nu=NU_SEA):
    """Return (drag N, lam) at this trim, or None if the weight cannot be carried inside Savitsky's lam range
    or the speed is outside Cv 1 to 25."""
    cv = v / math.sqrt(G * beam)
    if not 1.0 <= cv <= 25.0:
        return None
    lam = wetted_length_ratio(v, mass, beam, tau_deg, beta_deg, rho=rho)
    if lam is None:
        return None
    t, b = math.radians(tau_deg), math.radians(beta_deg)
    cf = cf_ittc57(v * lam * beam / nu)
    df = cf * 0.5 * rho * v * v * lam * beam * beam / math.cos(b)
    return mass * G * math.tan(t) + df / math.cos(t), lam


def best_trim_drag(v, mass, beam, beta_deg, trims=range(2, 16)):
    best = None
    for tau in trims:
        r = planing_drag(v, mass, beam, float(tau), beta_deg)
        if r and (best is None or r[0] < best[0]):
            best = (r[0], r[1], float(tau))
    return best
