"""Check the osrobot-uav multirotor power model against published aircraft.

For each aircraft with a published all-up mass, pack energy and endurance, the model's electrical power
(`osrobot_uav.model`, imported unchanged) is computed at the published regime, and the endurance it implies
is compared with the published one. Rotor diameter is not in the sourced tables, so it is swept.
"""
import math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "osrobot-uav", "src"))
from osrobot_uav import model as M

# (name, mass kg, pack Wh, published endurance min, forward speed m/s or None for best-range, source)
# Mavic 3E: en.wikipedia.org/wiki/DJI_Mavic_3 (max takeoff 1.050 kg, 5000 mAh x 15.4 V = 77 Wh, 45 min max flight).
# Anafi UKR: en.wikipedia.org/wiki/Parrot_Anafi (max takeoff 1.450 kg, 6800 mAh x 11.55 V = 78.54 Wh,
#            "38 minutes at 21.6 km/h" = 6.0 m/s).
AIRCRAFT = [
    ("DJI Mavic 3E", 1.050, 5000e-3 * 15.4, 45.0, None),
    ("Parrot Anafi UKR", 1.450, 6.8 * 11.55, 38.0, 21.6 / 3.6),
]
# Sourced rotor diameter: DJI Mavic 3 low-noise propellers, "Diameter x Thread Pitch 9.4x5.3 in (23.9x13.5 cm)"
# (DJI store listing, found by web search 2026-10-22; the page itself was not fetchable from the sandbox, so
# the figure is the search snippet's). Applies to the Mavic 3 family. No Anafi UKR diameter was found.
SOURCED_DIAM = {"DJI Mavic 3E": 9.4 * 0.0254}
DIAMS = [0.15, 0.18, 0.20, 0.22, 0.25, 0.28, 0.30]  # m, per rotor (swept; not in the sourced tables)
USABLE = [0.80, 0.90, 1.00]                          # share of pack energy actually flown


def power(mass, d, v):
    """Model electrical power (W) in level flight at v m/s (None: the model's best-range speed)."""
    if v is None:
        v, p = M.mr_best_speed(mass, d)
        return v, p
    return v, M.fwd_power(mass, d, v)


def endurance_min(mass, wh, d, v, usable):
    v, p = power(mass, d, v)
    return usable * wh * 60.0 / (p + M.P_AVIONICS), v


def implied_efficiency_scale(mass, wh, minutes, d, v, usable):
    """Factor by which FM x drive efficiency would have to be multiplied for the model to give exactly the
    published endurance (power scales ~1/(FM*eta) in the induced term; here the whole propulsive power is scaled)."""
    v, p = power(mass, d, v)
    p_pub = usable * wh * 60.0 / minutes - M.P_AVIONICS
    return p / p_pub


def matching_diameter(mass, wh, minutes, v, usable, lo=0.05, hi=0.6):
    """Rotor diameter (m) at which the model's endurance equals the published one (bisection; endurance rises
    with diameter), or None if it is outside [lo, hi]."""
    f = lambda d: endurance_min(mass, wh, d, v, usable)[0] - minutes
    if f(lo) > 0 or f(hi) < 0:
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2
