"""Bowden efficiency from cable bend angle (capstan / Euler-Eytelwein), fed into garment-assistloc.

Tension out = tension in * exp(-mu * theta) for a cable bent through total angle theta (rad) in a sheath
with friction coefficient mu. The law is textbook; mu and the bend angle of a hip-to-ankle route are ASSUMED.
"""
import math, sys, os
_here = os.path.dirname(__file__)
for p in ("garment-assist", "garment-assistpower", "garment-assistloc"):
    sys.path.insert(0, os.path.join(_here, "..", "..", "..", p, "src"))
from garment_assistloc.location import Layout, net_change, break_even_ratio
from garment_assistpower.powertrain import PowerTrain


def bowden_eff(mu, theta_rad):
    if mu < 0 or theta_rad < 0:
        raise ValueError("mu and theta must be non-negative")
    return math.exp(-mu * theta_rad)


def waist_net(gain, hours, ratio, mu, theta, pt=PowerTrain(), cable_kg=0.3):
    return net_change("waist", gain, hours, ratio, pt, Layout(bowden_eff=bowden_eff(mu, theta), cable_kg=cable_kg))


def critical_bend(gain, hours, ratio, mu, pt=PowerTrain(), cable_kg=0.3, hi=40.0):
    """Total bend angle (rad) at which the waist layout stops beating the shank layout (bisection).

    Returns 0.0 if the waist layout already loses with a straight cable, None if it wins even at `hi` rad.
    """
    def diff(th):  # waist minus shank; negative = waist wins
        return waist_net(gain, hours, ratio, mu, th, pt, cable_kg) - net_change("shank", gain, hours, ratio, pt)
    if diff(0.0) >= 0:
        return 0.0
    if diff(hi) < 0:
        return None
    lo, h = 0.0, hi
    for _ in range(80):
        m = (lo + h) / 2
        lo, h = (m, h) if diff(m) < 0 else (lo, m)
    return (lo + h) / 2
